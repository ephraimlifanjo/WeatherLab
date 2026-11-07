# ☀️ WeatherLab
**Live weather. A beautiful dashboard. Two real NoSQL databases.**

[View WeatherLab live](https://weatherlab-theta.vercel.app) · [Open-Meteo documentation](https://open-meteo.com/en/docs)

WeatherLab is a small, responsive weather application built as a NoSQL coursework project. It uses **HTML, CSS, vanilla JavaScript, Express.js, MongoDB, Apache Cassandra and Open-Meteo**.

## Features

- Live worldwide weather search (Open-Meteo geocoding)
- Current temperature, feels-like, wind, rain, humidity, UV, pressure and cloud cover
- 24-hour temperature graph and 7-day forecast
- Celsius/Fahrenheit switch, search suggestions and responsive mobile layout
- Save and remove cities in MongoDB, scoped to an anonymous browser ID
- Local browser favorites fallback if MongoDB isn't connected
- Write actual forecast observations to Cassandra when a city is loaded
- Query Cassandra observations by city and day
- NoSQL Lab with honest connection status, sample documents and CQL
- Free weather API with no secret API key required

**Important:** A weather forecast is not a physical sensor reading. WeatherLab records the *current weather values provided by Open-Meteo* and labels them observations for the coursework demonstration. These aren't independently measured or verified weather station observations.

## Architecture

```text
Browser (HTML + CSS + JavaScript)
       |
       v
Express REST API (Node.js)
   |          |              |
   v          v              v
Open-Meteo   MongoDB        Cassandra
Forecast     Favorites      Weather time series
and city     by anonymous   by city + day
search       browser ID
```

- **Open-Meteo** supplies real forecasts and current conditions.
- **MongoDB** stores flexible saved-city documents.
- **Cassandra** stores readings in a wide-column table suited to time-based queries.
- **Express** exposes REST endpoints and handles integration, validation and errors.
- **Vercel** hosts the website and Express API, **not** the database servers.

## Prerequisites

- Node.js 20 or newer
- Docker Desktop (Docker Compose enabled)
- For Docker: preferably **4 GB available RAM or more**; Cassandra is memory-heavy.

## Run locally (Windows PowerShell)

```powershell
git clone https://github.com/ephraimlifanjo/WeatherLab.git
cd WeatherLab
Copy-Item .env.example .env
docker compose up -d
docker compose ps
npm install
npm start
```

Visit **http://localhost:3000**.

The Cassandra image may need a minute or two to initialize on first run. The app will work with Open-Meteo immediately; DB-dependent actions start working when databases are ready. The connection is retried on subsequent requests.

Test the installation:

```powershell
Invoke-RestMethod http://localhost:3000/api/health
Invoke-RestMethod "http://localhost:3000/api/weather?lat=4.0511&lon=9.7679&name=Douala"
npm test
```

Stop the local databases with `docker compose down`. Use `docker compose down -v` **only if you deliberately want to delete all local database data**.

## MongoDB: what it does

MongoDB stores BSON documents (JSON-like objects) in collections.

Example data in the `favorites` collection:

```json
{
  "visitorId": "f74f02d0-93e5-4ee3-abba-9e5c9b1f1ba6",
  "cityKey": "4.051_9.768",
  "name": "Douala",
  "country": "Cameroon",
  "region": "Littoral",
  "lat": 4.0511,
  "lon": 9.7679,
  "savedAt": "2026-11-07T12:00:00.000Z"
}
```

A compound unique index on `visitorId` and `cityKey` prevents duplicate favorites within the same browser.

Demonstrate the data in MongoDB:

```powershell
docker compose exec mongo mongosh weatherlab --eval "db.favorites.find().pretty()"
docker compose exec mongo mongosh weatherlab --eval "db.favorites.getIndexes()"
```

This app uses an anonymous visitor ID stored in browser `localStorage`. It is convenient for a classroom demo, **not secure user authentication**. For real public user accounts, add proper auth and enforce ownership server-side.

## Cassandra: what it does

Cassandra is a distributed wide-column database. Data models are designed around the queries you need. WeatherLab groups historical data by city and UTC observation date, then sorts within the partition by time descending.

Table:

```sql
CREATE TABLE weatherlab.weather_by_city_day (
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
```

Here `(city_key, observed_day)` is the **partition key**, while `observed_at` is the **clustering key**. The app writes data with a 90-day TTL to prevent unbounded long-term storage.

Run these commands after visiting Douala in the app:

```powershell
docker compose exec cassandra cqlsh -e "DESCRIBE KEYSPACE weatherlab"
docker compose exec cassandra cqlsh -e "SELECT city_key, observed_day, observed_at, temperature FROM weatherlab.weather_by_city_day LIMIT 10"
```

Because the table is created for time-series queries, ask for a specific city + date to make the partition lookup efficient. Don't query arbitrarily with `ALLOW FILTERING` in a production Cassandra schema.

**Why two databases?**

| MongoDB | Cassandra |
| --- | --- |
| Document store (BSON) | Distributed wide-column database |
| Flexible city/favorite fields | Rows modeled for known query patterns |
| `find`, `updateOne`, `deleteOne` | CQL `INSERT` and partition-key `SELECT` |
| Convenient user preferences | Efficient ordered data by city and day |
| Unique compound index | Partition key + clustering key |

## REST API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Real database connection status |
| GET | `/api/search?q=Douala` | Search global cities |
| GET | `/api/weather?lat=4.0511&lon=9.7679&name=Douala` | Live weather + Cassandra write attempt |
| GET | `/api/history?lat=4.0511&lon=9.7679` | Last three UTC days of Cassandra observations |
| GET | `/api/favorites` | MongoDB saved cities for browser |
| POST | `/api/favorites` | Add MongoDB favorite |
| DELETE | `/api/favorites/:key` | Remove MongoDB favorite |

Favorites endpoints require the `x-visitor-id` header (a 24–64 character ID) to distinguish browser sessions.

## Deploy on Vercel

The GitHub repository is linked to the **weatherlab** Vercel project. Pushing to `main` automatically creates a production deployment. Vercel can run Express, but **it does not start Docker Compose containers or host Cassandra/MongoDB for you**.

The deployed weather dashboard can use the weather API immediately. If the production databases are not configured, the NoSQL Lab truthfully shows **Not configured**. Saved cities continue to work locally in the browser.

To enable cloud database storage, configure the **Environment Variables** under the WeatherLab project in Vercel:

| Variable | Use |
| --- | --- |
| `MONGODB_URI` | MongoDB Atlas or other reachable MongoDB connection URI |
| `CASSANDRA_CONTACT_POINTS` | Externally reachable Cassandra nodes (regular cluster) |
| `CASSANDRA_DATACENTER` | Cassandra local datacenter, commonly `datacenter1` |
| `CASSANDRA_PORT` | Port, usually `9042` |
| `CASSANDRA_USERNAME` / `CASSANDRA_PASSWORD` | Cassandra credentials when auth is enabled |
| `CASSANDRA_SECURE_BUNDLE_BASE64` | Optional base64 of secure connect bundle for Astra-like managed cloud Cassandra |
| `CASSANDRA_KEYSPACE` | Keyspace, default `weatherlab` |

For managed Cassandra cloud bundles, create the `weatherlab` keyspace first in your provider's admin console; the application automatically creates the table. For a secure bundle use the provider's correct datacenter name if required.

**Never commit secrets** to the repository. Add sensitive values only in Vercel Settings → Environment Variables. For secure Cassandra connections, follow the managed provider's TLS and networking documentation; do not open a local Cassandra container directly to the public internet.

After setting variables, redeploy and visit `/api/health` to verify both report `connected`.

## Free API usage

Open-Meteo offers an API key-free option for **non-commercial** projects. As of November 2026, its free-tier terms include a limit of **10,000 calls/day, 5,000/hour and 600/minute**, with no uptime guarantee. WeatherLab keeps a small in-memory forecast cache (10 minutes per city per running function). On Vercel that cache is per instance and isn't a global shared cache.

See: [Open-Meteo pricing](https://open-meteo.com/en/pricing) and [terms](https://open-meteo.com/en/terms). Weather data is provided under CC BY 4.0 and the website displays attribution.

## Presentation walkthrough (5 minutes)

1. **Overview:** Show the live weather for Douala and search Yaoundé; explain where the external data comes from.
2. **Express:** Open `/api/weather` and explain request → server → API → response.
3. **MongoDB:** Click the heart on a city, then show the BSON document in `db.favorites.find()`.
4. **Cassandra:** Refresh that city's weather and show the saved rows with `cqlsh`. Explain partition and clustering keys.
5. **Differences:** MongoDB is flexible for user preferences; Cassandra is organized for many timestamped readings.
6. **Limits:** Mention the NoSQL Lab's real connection checks, and that Vercel hosts the API but not local Docker databases.

## Project structure

```text
WeatherLab/
├── server.js                   Express API (local + Vercel)
├── lib/
│   ├── weather.js              Open-Meteo requests + cache
│   ├── databases.js            MongoDB + Cassandra drivers
│   └── helpers.js              Validation + UTC conversion
├── public/
│   ├── index.html              UI
│   ├── styles.css              Responsive styles
│   ├── app.js                  UI interactions
│   └── favicon.svg
├── db/schema.cql               Cassandra schema reference
├── tests/helpers.test.js       Node unit tests
├── docker-compose.yml          Local Mongo + Cassandra
├── vercel.json                  Web routing config
└── .env.example                Local environment template
```

Built for learning — WeatherLab is a class demonstration, not a meteorological warning system.
