// WeatherLab — JavaScript simple : rechercher, afficher, sauvegarder, consulter.
const byId = (id) => document.getElementById(id);
function createVisitorId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : 'student-' + Date.now().toString(36) + Math.random().toString(36).slice(2);
}
let visitor;
try {
  visitor = localStorage.getItem('weatherlab-visitor') || createVisitorId();
  localStorage.setItem('weatherlab-visitor', visitor);
} catch {
  // La météo reste accessible même quand le navigateur bloque le stockage local.
  visitor = createVisitorId();
}

// Coordonnées confirmées par le service de géolocalisation Open-Meteo.
// Un clic suffit pour les trois villes utilisées dans l'exposé.
const quickCities = {
  'Douala': { name: 'Douala', country: 'Cameroun', region: 'Littoral', lat: 4.04827, lon: 9.70428 },
  'Yaoundé': { name: 'Yaoundé', country: 'Cameroun', region: 'Centre', lat: 3.86667, lon: 11.51667 },
  'Ngaoundéré': { name: 'Ngaoundéré', country: 'Cameroun', region: 'Adamaoua', lat: 7.32765, lon: 13.58472 }
};
let currentCity = quickCities.Douala;
let mongoReady = false;
let cassandraReady = false;
let favorites = [];
let requestNumber = 0;

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'x-visitor-id': visitor, ...(options.body ? { 'Content-Type': 'application/json' } : {}) }
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Une erreur est survenue.');
  return body;
}

function notice(message) {
  byId('notice').textContent = message;
  byId('notice').hidden = !message;
}

function formatTemperature(value) {
  return value == null ? '--' : Math.round(value) + '°';
}

function weatherType(code) {
  if (code === 0) return ['☀️', 'Ciel dégagé'];
  if (code === 1 || code === 2) return ['🌤️', 'Partiellement nuageux'];
  if (code === 3) return ['☁️', 'Nuageux'];
  if (code === 45 || code === 48) return ['🌫️', 'Brouillard'];
  if (code >= 51 && code <= 67) return ['🌦️', 'Pluie légère'];
  if ([71, 73, 75, 77, 85, 86].includes(code)) return ['❄️', 'Neige'];
  if (code >= 95) return ['⛈️', 'Orage'];
  if (code >= 80 && code <= 82) return ['🌧️', 'Pluie'];
  return ['⛅', 'Temps variable'];
}

function renderForecast(days) {
  const root = byId('forecast-list');
  root.replaceChildren();
  days.slice(0, 5).forEach((day, index) => {
    const date = index === 0 ? "Aujourd'hui" : new Date(day.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long' });
    const [symbol, text] = weatherType(day.code);
    const row = document.createElement('div');
    row.className = 'forecast-day';
    const label = document.createElement('strong');
    label.className = 'day-label';
    label.textContent = date.charAt(0).toUpperCase() + date.slice(1);
    const condition = document.createElement('span');
    condition.className = 'day-condition';
    const icon = document.createElement('span');
    icon.textContent = symbol;
    condition.append(icon, document.createTextNode(text));
    const temperatures = document.createElement('span');
    temperatures.className = 'day-temperature';
    const high = document.createElement('strong');
    high.textContent = formatTemperature(day.high);
    const low = document.createElement('small');
    low.textContent = formatTemperature(day.low);
    temperatures.append(high, low);
    row.append(label, condition, temperatures);
    root.appendChild(row);
  });
}

async function loadWeather() {
  const number = ++requestNumber;
  const city = currentCity;
  byId('city-name').textContent = city.name + ', ' + (city.country || 'Cameroun');
  byId('description').textContent = 'Chargement...';
  byId('feels-like').textContent = 'Récupération des données météo...';
  notice('');
  try {
    const qs = new URLSearchParams({ lat: city.lat, lon: city.lon, name: city.name });
    const data = await request('/api/weather?' + qs);
    if (number !== requestNumber) return;
    const now = data.current;
    const [symbol, label] = weatherType(now.weather_code);
    byId('temperature').textContent = now.temperature_2m == null ? '--' : Math.round(now.temperature_2m);
    byId('weather-icon').textContent = symbol;
    byId('description').textContent = label;
    byId('feels-like').textContent = 'Ressenti : ' + formatTemperature(now.apparent_temperature).replace('°', '°C');
    byId('humidity').textContent = (now.relative_humidity_2m ?? '--') + ' %';
    byId('wind').textContent = (now.wind_speed_10m ?? '--') + ' km/h';
    byId('rain').textContent = (now.precipitation ?? '--') + ' mm';
    byId('updated').textContent = 'Mise à jour : ' + now.time.slice(11, 16) + ' · Open-Meteo';
    renderForecast(data.days);
    updateSaveButton();
    await loadHistory(number);
  } catch (error) {
    if (number !== requestNumber) return;
    byId('description').textContent = 'Météo indisponible';
    byId('feels-like').textContent = '';
    notice(error.message);
  }
}

function showCityChoices(cities) {
  const box = byId('city-results');
  box.replaceChildren();
  cities.slice(0, 5).forEach((city) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'city-option';
    const name = document.createElement('strong');
    name.textContent = city.name;
    const place = document.createElement('small');
    place.textContent = [city.region, city.country].filter(Boolean).join(', ');
    button.append(name, place);
    button.addEventListener('click', () => {
      box.hidden = true;
      currentCity = city;
      byId('city-search').value = '';
      loadWeather();
    });
    box.appendChild(button);
  });
  box.hidden = false;
  box.querySelector('button')?.focus();
}

async function searchCity(name) {
  byId('city-results').hidden = true;
  const input = name.trim();
  if (input.length < 2) return notice('Entre au moins deux lettres.');
  const button = byId('search-button');
  button.disabled = true;
  button.textContent = 'Recherche...';
  notice('');
  try {
    const data = await request('/api/search?q=' + encodeURIComponent(input));
    if (!data.cities.length) throw new Error('Ville introuvable. Essaie un autre nom.');
    const matches = data.cities;
    // Plusieurs villes peuvent porter le même nom. L'étudiant choisit la bonne.
    showCityChoices(matches);
  } catch (error) { notice(error.message); }
  finally { button.disabled = false; button.textContent = 'Rechercher'; }
}

function showStatus(elementId, state) {
  const element = byId(elementId);
  element.className = 'status ' + (state === 'connected' ? 'ok' : 'no');
  element.textContent = state === 'connected' ? '● Connecté' : state === 'not configured' ? 'Non configuré' : '● Hors ligne';
}

async function checkDatabases() {
  try {
    const status = await request('/api/health');
    mongoReady = status.mongo === 'connected';
    cassandraReady = status.cassandra === 'connected';
    showStatus('mongo-status', status.mongo);
    showStatus('cassandra-status', status.cassandra);
    byId('database-help').textContent = !mongoReady || !cassandraReady
      ? 'Pour utiliser les deux bases, lance Docker en local ou configure des bases hébergées sur Vercel.'
      : 'MongoDB et Cassandra sont connectés. Tu peux faire ta démonstration !';
    updateSaveButton();
    await Promise.all([loadFavorites(), loadHistory(requestNumber)]);
  } catch {
    mongoReady = false;
    cassandraReady = false;
    showStatus('mongo-status', 'offline');
    showStatus('cassandra-status', 'offline');
    updateSaveButton();
  }
}

function updateSaveButton() {
  const saved = favorites.some((city) => city.lat?.toFixed(3) === currentCity.lat.toFixed(3) && city.lon?.toFixed(3) === currentCity.lon.toFixed(3));
  const button = byId('save-button');
  button.disabled = !mongoReady || saved;
  button.textContent = saved ? '✓ Ville déjà enregistrée' : '♡ Enregistrer cette ville';
  byId('save-hint').textContent = !mongoReady ? 'MongoDB non connecté : action indisponible' : saved ? 'Cette ville est déjà dans MongoDB.' : 'Cette action ajoute un document dans MongoDB.';
}

async function loadFavorites() {
  const root = byId('favorites-list');
  root.replaceChildren();
  if (!mongoReady) {
    root.textContent = 'MongoDB non connecté. Les favoris ne sont pas enregistrés.';
    return;
  }
  try {
    const data = await request('/api/favorites');
    favorites = data.cities;
    if (!favorites.length) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = 'Aucune ville enregistrée pour le moment.';
      root.appendChild(empty);
    }
    favorites.forEach((city) => {
      const chip = document.createElement('div');
      chip.className = 'favorite';
      const name = document.createElement('span');
      name.textContent = city.name;
      name.title = 'Cliquer pour voir la météo';
      name.style.cursor = 'pointer';
      name.addEventListener('click', () => { currentCity = city; loadWeather(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '×';
      remove.setAttribute('aria-label', 'Retirer ' + city.name);
      remove.addEventListener('click', async () => {
        try {
          await request('/api/favorites/' + encodeURIComponent(city.cityKey), { method: 'DELETE' });
          await loadFavorites();
        } catch (error) { notice(error.message); }
      });
      chip.append(name, remove);
      root.appendChild(chip);
    });
    updateSaveButton();
  } catch (error) { root.textContent = 'Impossible de lire les favoris : ' + error.message; }
}

async function saveFavorite() {
  try {
    await request('/api/favorites', { method: 'POST', body: JSON.stringify(currentCity) });
    await loadFavorites();
  } catch (error) { notice(error.message); }
}

async function loadHistory(number) {
  const root = byId('history-list');
  root.replaceChildren();
  if (!cassandraReady) {
    root.textContent = 'Cassandra non connecté. Aucun historique disponible.';
    byId('history-count').textContent = '';
    return;
  }
  try {
    const qs = new URLSearchParams({ lat: currentCity.lat, lon: currentCity.lon });
    const data = await request('/api/history?' + qs);
    if (number !== requestNumber) return;
    const rows = data.observations.slice(0, 5);
    byId('history-count').textContent = '(' + data.observations.length + ')';
    if (!rows.length) { root.textContent = 'Actualise la météo pour ajouter une première consultation.'; return; }
    rows.forEach((entry) => {
      const row = document.createElement('div');
      row.className = 'history-row';
      const date = document.createElement('time');
      date.dateTime = entry.time;
      date.textContent = new Date(entry.time).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
      const temperature = document.createElement('strong');
      temperature.textContent = formatTemperature(entry.temperature);
      row.append(date, temperature);
      root.appendChild(row);
    });
  } catch (error) { root.textContent = 'Historique indisponible : ' + error.message; }
}

document.addEventListener('click', (event) => {
  if (!event.target.closest('.search-form') && !event.target.closest('#city-results')) {
    byId('city-results').hidden = true;
  }
});
byId('city-search').addEventListener('keydown', (event) => {
  if (event.key === 'Escape') byId('city-results').hidden = true;
});
byId('search-form').addEventListener('submit', (event) => { event.preventDefault(); searchCity(byId('city-search').value); });
byId('refresh-button').addEventListener('click', loadWeather);
byId('check-button').addEventListener('click', checkDatabases);
byId('save-button').addEventListener('click', saveFavorite);
document.querySelectorAll('[data-city]').forEach((button) => button.addEventListener('click', () => {
  byId('city-results').hidden = true;
  currentCity = quickCities[button.dataset.city];
  loadWeather();
}));
loadWeather();
checkDatabases();
