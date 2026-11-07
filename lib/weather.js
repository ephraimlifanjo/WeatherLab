'use strict';
const { cityKey } = require('./helpers');
const cache = new Map();
async function fromOpenMeteo(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(12500), headers: { accept: 'application/json' } });
  if (!response.ok) { const e = new Error('Weather service unavailable (' + response.status + ').'); e.status = 502; throw e; }
  return response.json();
}
async function searchCities(query) {
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.search = new URLSearchParams({ name: query, count: '7', language: 'en', format: 'json' }).toString();
  const data = await fromOpenMeteo(url);
  return (data.results || []).map(c => ({
    id: c.id, name: c.name, country: c.country || '', region: c.admin1 || '',
    lat: c.latitude, lon: c.longitude, timezone: c.timezone || 'auto'
  }));
}
async function getWeather(lat, lon) {
  const key = cityKey(lat, lon);
  const item = cache.get(key);
  if (item && Date.now() < item.expires) return item.data;
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({
    latitude: String(lat), longitude: String(lon), timezone: 'auto', forecast_days: '7',
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,wind_speed_10m,surface_pressure,is_day',
    hourly: 'temperature_2m,precipitation_probability,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,sunrise,sunset'
  }).toString();
  const raw = await fromOpenMeteo(url);
  if (!raw.current || !raw.hourly || !raw.daily) { const e = new Error('Invalid weather response.'); e.status = 502; throw e; }
  const currentHour = raw.current.time.slice(0, 13);
  let start = raw.hourly.time.findIndex(t => t.slice(0, 13) === currentHour);
  if (start < 0) start = 0;
  const hours = raw.hourly.time.slice(start, start + 24).map((time, i) => ({
    time, temperature: raw.hourly.temperature_2m[start + i],
    rain: raw.hourly.precipitation_probability[start + i], code: raw.hourly.weather_code[start + i]
  }));
  const days = raw.daily.time.map((date, i) => ({
    date, code: raw.daily.weather_code[i], high: raw.daily.temperature_2m_max[i],
    low: raw.daily.temperature_2m_min[i], rain: raw.daily.precipitation_probability_max[i],
    uv: raw.daily.uv_index_max[i], sunrise: raw.daily.sunrise[i], sunset: raw.daily.sunset[i]
  }));
  const data = { current: raw.current, hours, days, timezone: raw.timezone, utcOffsetSeconds: raw.utc_offset_seconds || 0,
    updated: raw.current.time, source: 'Open-Meteo' };
  if (cache.size > 100) cache.delete(cache.keys().next().value);
  cache.set(key, { data, expires: Date.now() + 10 * 60 * 1000 });
  return data;
}
module.exports = { searchCities, getWeather };
