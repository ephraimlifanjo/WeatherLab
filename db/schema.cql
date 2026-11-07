-- Cassandra demonstration queries. The Express API creates these automatically
-- for local Cassandra. For managed Cassandra create the keyspace manually.
CREATE KEYSPACE IF NOT EXISTS weatherlab WITH replication =
  {'class': 'SimpleStrategy', 'replication_factor': 1};

CREATE TABLE IF NOT EXISTS weatherlab.weather_by_city_day (
  city_key text,
  observed_day date,
  observed_at timestamp,
  city_name text,
  temperature double,
  feels_like double,
  humidity int,
  wind_kmh double,
  precipitation double,
  weather_code int,
  PRIMARY KEY ((city_key, observed_day), observed_at)
) WITH CLUSTERING ORDER BY (observed_at DESC);

-- Query a specific partition efficiently:
-- SELECT * FROM weatherlab.weather_by_city_day
-- WHERE city_key = '4.051_9.768' AND observed_day = '2026-11-07';
