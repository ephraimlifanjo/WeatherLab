const test = require('node:test');
const assert = require('node:assert/strict');
const { coordinates, cityKey, weatherInstant, utcDates, visitorId } = require('../lib/helpers');
test('validates coordinates', () => {
  assert.deepEqual(coordinates({ lat: '4.051', lon: '9.768' }), { lat: 4.051, lon: 9.768 });
  assert.throws(() => coordinates({ lat: '100', lon: '9' }), /Invalid/);
  assert.throws(() => coordinates({ lat: '', lon: '0' }), /required/);
});
test('generates Cassandra city partition key', () => assert.equal(cityKey(4.0511, 9.7679), '4.051_9.768'));
test('converts Open-Meteo local time to UTC', () => {
  assert.equal(weatherInstant('2026-11-07T12:15', 3600).toISOString(), '2026-11-07T11:15:00.000Z');
});
test('handles UTC day boundary', () => assert.deepEqual(utcDates(2, new Date('2026-01-01T01:00:00Z')), ['2026-01-01', '2025-12-31']));
test('requires anonymous visitor id', () => {
  assert.equal(visitorId({ get: () => '12345678-1234-1234-1234-123456789012' }), '12345678-1234-1234-1234-123456789012');
  assert.throws(() => visitorId({ get: () => '' }), /visitor/);
});
