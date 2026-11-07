'use strict';
function coordinates(input) {
  if (input.lat === undefined || input.lon === undefined || String(input.lat).trim() === '' || String(input.lon).trim() === '') throw badRequest('Latitude and longitude are required.');
  const lat = Number(input.lat), lon = Number(input.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) throw badRequest('Invalid coordinates.');
  return { lat, lon };
}
function badRequest(message) { const error = new Error(message); error.status = 400; return error; }
const cityKey = (lat, lon) => Number(lat).toFixed(3) + '_' + Number(lon).toFixed(3);
function safeText(input, limit = 90) { return String(input ?? '').trim().replace(/[<>]/g, '').slice(0, limit); }
function visitorId(req) {
  const id = String(req.get('x-visitor-id') || '');
  if (!/^[a-zA-Z0-9-]{24,64}$/.test(id)) throw badRequest('Missing or invalid visitor ID.');
  return id;
}
function weatherInstant(localTime, offsetSeconds = 0) {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?$/.test(String(localTime))) throw new Error('Invalid weather observation time.');
  const date = new Date(Date.parse(localTime + 'Z') - Number(offsetSeconds) * 1000);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid observation time.');
  return date;
}
function utcDates(count = 3, now = new Date()) {
  return Array.from({ length: count }, (_, index) => new Date(now.getTime() - index * 86400000).toISOString().slice(0, 10));
}
module.exports = { coordinates, badRequest, cityKey, safeText, visitorId, weatherInstant, utcDates };
