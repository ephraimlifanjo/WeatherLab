'use strict';
require('dotenv').config();
const path = require('node:path');
const express = require('express');
const { coordinates, badRequest, safeText, visitorId } = require('./lib/helpers');
const { getWeather, searchCities } = require('./lib/weather');
const { dbHealth, listFavorites, putFavorite, deleteFavorite, saveObservation, getHistory } = require('./lib/databases');
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));
if (!process.env.VERCEL) app.use(express.static(path.join(__dirname, 'public')));
// Vercel's Express handler takes / before its static CDN routing. Redirect to the deployed HTML.
app.get('/', (_req, res) => res.redirect(302, '/index.html'));
app.get('/api/health', async (_req, res) => {
  const status = await dbHealth();
  res.set('Cache-Control', 'no-store').json({ service: 'WeatherLab', weather: 'Open-Meteo', ...status, time: new Date().toISOString() });
});
app.get('/api/search', async (req, res, next) => {
  try {
    const q = safeText(req.query.q, 70);
    if (q.length < 2) throw badRequest('Enter at least 2 characters.');
    res.json({ cities: await searchCities(q) });
  } catch (e) { next(e); }
});
app.get('/api/weather', async (req, res, next) => {
  try {
    const { lat, lon } = coordinates(req.query);
    const city = { lat, lon, name: safeText(req.query.name) || 'Selected city' };
    const weather = await getWeather(lat, lon);
    let recorded = false;
    try { await saveObservation(city, weather); recorded = true; }
    catch (e) { console.warn('History storage:', e.message); }
    res.set('Cache-Control', 'private, max-age=120').json({ city, ...weather, recorded });
  } catch (e) { next(e); }
});
app.get('/api/history', async (req, res, next) => {
  try { const { lat, lon } = coordinates(req.query); res.json({ observations: await getHistory(lat, lon) }); }
  catch (e) { next(e); }
});
app.get('/api/favorites', async (req, res, next) => {
  try { res.set('Cache-Control', 'no-store').json({ cities: await listFavorites(visitorId(req)) }); }
  catch (e) { next(e); }
});
app.post('/api/favorites', async (req, res, next) => {
  try {
    const id = visitorId(req), { lat, lon } = coordinates(req.body || {});
    const name = safeText(req.body.name);
    if (!name) throw badRequest('City name is required.');
    res.status(201).json({ city: await putFavorite(id, { lat, lon, name, country: safeText(req.body.country), region: safeText(req.body.region) }) });
  } catch (e) { next(e); }
});
app.delete('/api/favorites/:key', async (req, res, next) => {
  try {
    if (!/^-?\d+\.\d{3}_-?\d+\.\d{3}$/.test(req.params.key)) throw badRequest('Invalid city key.');
    res.json({ removed: await deleteFavorite(visitorId(req), req.params.key) });
  } catch (e) { next(e); }
});
app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown API endpoint.' }));
app.use((error, _req, res, _next) => {
  const code = error.status || (/not configured|temporarily unavailable|ECONNREFUSED|Server selection timed out/i.test(error.message) ? 503 : 500);
  if (code >= 500) console.error('WeatherLab error:', error.message);
  res.status(code).json({ error: code === 503 ? 'Database unavailable. Check its connection in the NoSQL Lab.' : code === 500 ? 'Server error. Please retry.' : error.message });
});
module.exports = app;
if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => console.log('WeatherLab running on http://localhost:' + port));
}
