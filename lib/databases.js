'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { MongoClient } = require('mongodb');
const { Client, auth, types } = require('cassandra-driver');
const { cityKey, weatherInstant, utcDates } = require('./helpers');
const isVercel = Boolean(process.env.VERCEL);
const mongoUri = process.env.MONGODB_URI || (isVercel ? '' : 'mongodb://127.0.0.1:27017/weatherlab');
const cassandraHosts = process.env.CASSANDRA_CONTACT_POINTS || (isVercel ? '' : '127.0.0.1');
const keyspace = process.env.CASSANDRA_KEYSPACE || 'weatherlab';
if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(keyspace)) throw new Error('Invalid Cassandra keyspace name.');
let mongoPromise, cassandraPromise, mongoRetryAt = 0, cassandraRetryAt = 0;
let mongoConnected = false, cassandraConnected = false;
async function mongo() {
  if (!mongoUri) throw new Error('MongoDB not configured');
  if (Date.now() < mongoRetryAt) throw new Error('MongoDB temporarily unavailable');
  if (!mongoPromise) mongoPromise = (async () => {
    const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 3000, maxPoolSize: 5 });
    try {
      await client.connect();
      const db = client.db();
      await db.collection('favorites').createIndex({ visitorId: 1, cityKey: 1 }, { unique: true });
      mongoConnected = true;
      return db;
    } catch (e) { await client.close().catch(() => {}); throw e; }
  })().catch(err => { mongoPromise = null; mongoConnected = false; mongoRetryAt = Date.now() + 12000; throw err; });
  return mongoPromise;
}
async function cassandra() {
  if (!cassandraHosts && !process.env.CASSANDRA_SECURE_BUNDLE_BASE64) throw new Error('Cassandra not configured');
  if (Date.now() < cassandraRetryAt) throw new Error('Cassandra temporarily unavailable');
  if (!cassandraPromise) cassandraPromise = (async () => {
    const options = {
      localDataCenter: process.env.CASSANDRA_DATACENTER || 'datacenter1',
      socketOptions: { connectTimeout: 3000, readTimeout: 4500 },
      protocolOptions: { port: Number(process.env.CASSANDRA_PORT) || 9042 }
    };
    if (process.env.CASSANDRA_SECURE_BUNDLE_BASE64) {
      const bundle = path.join(os.tmpdir(), 'weatherlab-secure-connect.zip');
      fs.writeFileSync(bundle, Buffer.from(process.env.CASSANDRA_SECURE_BUNDLE_BASE64, 'base64'), { mode: 0o600 });
      options.cloud = { secureConnectBundle: bundle };
    } else options.contactPoints = cassandraHosts.split(',').map(s => s.trim());
    if (process.env.CASSANDRA_USERNAME && process.env.CASSANDRA_PASSWORD)
      options.authProvider = new auth.PlainTextAuthProvider(process.env.CASSANDRA_USERNAME, process.env.CASSANDRA_PASSWORD);
    const client = new Client(options);
    try {
      await client.connect();
      if (!options.cloud) await client.execute("CREATE KEYSPACE IF NOT EXISTS " + keyspace + " WITH replication = {'class':'SimpleStrategy','replication_factor':1}");
      await client.execute(`CREATE TABLE IF NOT EXISTS ${keyspace}.weather_by_city_day (
        city_key text, observed_day date, observed_at timestamp, city_name text,
        temperature double, feels_like double, humidity int, wind_kmh double,
        precipitation double, weather_code int,
        PRIMARY KEY ((city_key, observed_day), observed_at)
      ) WITH CLUSTERING ORDER BY (observed_at DESC)`);
      cassandraConnected = true;
      return client;
    } catch (e) { await client.shutdown().catch(() => {}); throw e; }
  })().catch(err => { cassandraPromise = null; cassandraConnected = false; cassandraRetryAt = Date.now() + 12000; throw err; });
  return cassandraPromise;
}
async function saveObservation(city, weather) {
  const db = await cassandra();
  const current = weather.current;
  const instant = weatherInstant(current.time, weather.utcOffsetSeconds);
  const cql = `INSERT INTO ${keyspace}.weather_by_city_day
    (city_key, observed_day, observed_at, city_name, temperature, feels_like, humidity, wind_kmh, precipitation, weather_code)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) USING TTL 7776000`;
  await db.execute(cql, [cityKey(city.lat, city.lon),
    types.LocalDate.fromString(instant.toISOString().slice(0, 10)), instant, city.name,
    current.temperature_2m ?? null, current.apparent_temperature ?? null,
    current.relative_humidity_2m ?? null, current.wind_speed_10m ?? null,
    current.precipitation ?? null, current.weather_code ?? null], { prepare: true });
}
async function getHistory(lat, lon) {
  const db = await cassandra();
  const cql = `SELECT observed_at, temperature, feels_like, humidity, wind_kmh, precipitation, weather_code
    FROM ${keyspace}.weather_by_city_day WHERE city_key = ? AND observed_day = ? LIMIT 50`;
  const partitions = await Promise.all(utcDates(3).map(day =>
    db.execute(cql, [cityKey(lat, lon), types.LocalDate.fromString(day)], { prepare: true })));
  return partitions.flatMap(result => result.rows.map(row => ({
    time: row.observed_at.toISOString(), temperature: row.temperature, feelsLike: row.feels_like,
    humidity: row.humidity, wind: row.wind_kmh, rain: row.precipitation, code: row.weather_code
  }))).sort((a, b) => b.time.localeCompare(a.time)).slice(0, 50);
}
async function listFavorites(id) {
  const db = await mongo();
  const rows = await db.collection('favorites').find({ visitorId: id }, { projection: { _id: 0, visitorId: 0 } }).sort({ savedAt: -1 }).limit(30).toArray();
  return rows;
}
async function putFavorite(id, city) {
  const db = await mongo();
  const key = cityKey(city.lat, city.lon);
  await db.collection('favorites').updateOne({ visitorId: id, cityKey: key },
    { $set: { name: city.name, country: city.country, region: city.region, lat: city.lat, lon: city.lon },
      $setOnInsert: { visitorId: id, cityKey: key, savedAt: new Date() } }, { upsert: true });
  return { ...city, cityKey: key };
}
async function deleteFavorite(id, key) {
  const db = await mongo();
  return (await db.collection('favorites').deleteOne({ visitorId: id, cityKey: key })).deletedCount > 0;
}
async function dbHealth() {
  const [m, c] = await Promise.allSettled([mongo(), cassandra()]);
  return {
    mongo: !mongoUri ? 'not configured' : (m.status === 'fulfilled' ? 'connected' : 'offline'),
    cassandra: !cassandraHosts && !process.env.CASSANDRA_SECURE_BUNDLE_BASE64 ? 'not configured' : (c.status === 'fulfilled' ? 'connected' : 'offline')
  };
}
module.exports = { dbHealth, listFavorites, putFavorite, deleteFavorite, saveObservation, getHistory };
