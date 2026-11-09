# WeatherLab ☁️

**Mini-projet NoSQL : météo en direct + MongoDB + Cassandra**

🌍 **Site :** https://weatherlab-theta.vercel.app

## L'idée

On entre le nom d'une ville. Le site montre la météo, puis utilise **deux bases NoSQL** :

- **MongoDB** : enregistrer les villes favorites (documents).
- **Cassandra** : conserver la température et l'heure des consultations (historique).
- **Open-Meteo** : obtenir des données météo réelles, gratuitement, sans clé API pour ce projet non commercial.

**Technologies :** HTML, CSS, JavaScript, Node.js, Express.js, MongoDB, Cassandra.

## 1. Lancer sur un ordinateur (PowerShell)

Installer **Node.js**, **Git** et **Docker Desktop**. Puis :

```powershell
git clone https://github.com/ephraimlifanjo/WeatherLab.git
cd WeatherLab
Copy-Item .env.example .env
docker compose up -d
npm install
npm start
```

Ouvrir **http://localhost:3000**.

**Important :** Cassandra peut prendre quelques minutes au premier démarrage. Si les deux bases affichent « Hors ligne », attendre qu'elles démarrent et cliquer sur « Tester les bases ».

Pour les arrêter : `docker compose down` (sans supprimer les données).

## 2. Expliquer les bases en classe

| | MongoDB | Cassandra |
|---|---|---|
| Type | Base de documents | Base orientée colonnes (wide-column) |
| Stockage | Les villes favorites | L'historique météo |
| Exemple | Douala, Cameroun | Douala, 30°C, 14h30 |
| Fonction | `updateOne()` | `INSERT INTO` |

**MongoDB** sauvegarde les villes dans la collection `favorites`, avec le nom, le pays et les coordonnées. Chaque navigateur possède un identifiant anonyme. Pour voir les données :

```powershell
docker compose exec mongo mongosh weatherlab --eval "db.favorites.find().pretty()"
```

**Cassandra** sauvegarde les consultations dans la table `weather_by_city_day`. Les données sont organisées par **ville et jour**, puis par heure.

```powershell
docker compose exec cassandra cqlsh -e "SELECT city_name, temperature, observed_at FROM weatherlab.weather_by_city_day LIMIT 10"
```

La table se crée automatiquement au démarrage de la connexion. Le fichier `db/schema.cql` contient aussi sa définition.

## 3. Démonstration (5 minutes)

1. Chercher **Douala** : le site appelle l'API Open-Meteo via Express.
2. Cliquer sur **Enregistrer cette ville** : la ville va dans MongoDB.
3. Actualiser la météo : une consultation est enregistrée dans Cassandra.
4. Montrer les favoris et les dernières consultations directement dans le site.
5. Ouvrir les deux commandes ci-dessus et expliquer la différence entre les bases.

## 4. Structure du projet

```text
public/
  index.html       Une page web
  styles.css       Design responsive
  app.js           JavaScript du navigateur
server.js          Routes Express
lib/
  weather.js       API météo Open-Meteo
  databases.js     MongoDB + Cassandra
  helpers.js       Vérifications et dates
docker-compose.yml MongoDB + Cassandra en local
```

## 5. API Express

| URL | Description |
|---|---|
| `/api/search?q=Douala` | Chercher une ville |
| `/api/weather?lat=4.0511&lon=9.7679&name=Douala` | Météo actuelle + prévisions |
| `/api/favorites` | Villes dans MongoDB |
| `/api/history?lat=4.0511&lon=9.7679` | Historique dans Cassandra |
| `/api/health` | Vérifier les deux connexions |

## 6. Déploiement Vercel

Le site est déjà connecté au dépôt GitHub et se déploie automatiquement sur Vercel à chaque push vers `main`.

**Attention : Vercel héberge le site et Express, pas les conteneurs Docker.** La météo fonctionne immédiatement en ligne, mais MongoDB et Cassandra seront affichés comme « Non configuré » tant que des bases hébergées et leurs paramètres de connexion ne seront pas ajoutés dans Vercel.

Pour MongoDB, ajouter `MONGODB_URI`. Pour Cassandra, utiliser `CASSANDRA_CONTACT_POINTS`, `CASSANDRA_DATACENTER` et si nécessaire les identifiants ; le code accepte également un bundle sécurisé via `CASSANDRA_SECURE_BUNDLE_BASE64`. Voir `.env.example`.

Ne jamais publier ses mots de passe dans GitHub.

## Remarques

- Les températures viennent d'Open-Meteo : ce sont des données météo fournies par un service externe, pas des mesures prises avec notre propre capteur.
- Les consultations enregistrées en Cassandra ont une durée de vie de 90 jours.
- Les favoris sont propres à chaque navigateur. Ce petit système n'est **pas** une authentification pour une vraie application commerciale.
- Le projet est une **démonstration académique simple**, pas un service de prévisions météorologiques critique.
