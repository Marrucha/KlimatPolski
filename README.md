# 🌤️ Strefa Czystego Internetu – Moduł Pogodowy (Lubelszczyzna)

Automatyczny pipeline pogodowy dla województwa lubelskiego. Codziennie pobiera dane z NOAA GFS, przechowuje w Supabase i wyświetla na interaktywnym dashboardzie.

## 🚀 Cechy

- ✅ **Automatyczna synchronizacja** – GitHub Actions cron (codziennie 2 AM UTC)
- ✅ **Bezserwerowe** – No backend server, Firebase Hosting
- ✅ **Optymalne** – Free Tier Supabase + Firestore + Firebase
- ✅ **Lekkie** – Vanilla JS, bez React/npm build
- ✅ **Szybkie** – Static hosting, RLS policies, caching

## 📊 Zmienne pogodowe

Dla każdego punktu siatki (0.25° × 0.25°) w Lubelszczyznie:
- 🌡️ **Temperatura** (2m above ground)
- 💨 **Wiatr** (10m) – prędkość + kierunek
- 🌧️ **Opady** (suma 6h)
- ☁️ **Zachmurzenie** (%)

## 🏗️ Architektura

```
[NOAA GFS ERDDAP]
        ↓ (Python)
[GitHub Actions Cron]
        ↓
[Python Script]
   ├─ Fetch (xarray)
   ├─ Parse (weather_data)
   ├─ Aggregate (daily_stats)
   └─ Insert (Supabase psycopg2)
        ↓
[Supabase PostgreSQL]
        ↓
[Frontend (Vanilla JS)] ← REST API
        ↓
[Firebase Hosting]
```

## ⚡ Szybki start

### 1. Setup Supabase

```bash
# Klonuj schema do Supabase SQL Editor
# Otwórz: https://app.supabase.com → SQL Editor
# Copy-paste zawartość sql/schema.sql
# Execute
```

### 2. Setup GitHub Actions

Dodaj Secrets w: GitHub → Settings → Secrets and variables → Actions
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_API_KEY=your-key-here
FIREBASE_PROJECT_ID=xxx
FIREBASE_PRIVATE_KEY=xxx
FIREBASE_CLIENT_EMAIL=xxx
```

### 3. Test lokalnie

```bash
pip install -r requirements.txt
cp .env.example .env
# Edytuj .env
python scripts/fetch_data.py
```

Sprawdź Supabase Tables → weather_data

### 4. Deploy Frontend

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only hosting
```

## 📁 Struktura projektu

```
.
├── .github/workflows/
│   └── fetch-weather-data.yml       # Cron: codziennie 2 AM
├── scripts/
│   ├── fetch_data.py                # Main orchestrator
│   ├── config.py                    # Constants
│   ├── src/
│   │   ├── erddap_client.py         # NOAA API
│   │   ├── supabase_client.py       # DB write
│   │   ├── aggregator.py            # Daily stats
│   │   └── utils.py                 # Helpers
│   └── requirements.txt
├── frontend/
│   ├── index.html
│   ├── css/style.css
│   ├── js/
│   │   ├── main.js
│   │   ├── api.js
│   │   └── charts.js
│   └── assets/
├── sql/schema.sql
├── firebase.json
├── .env.example
└── README.md
```

## 🔧 Tech Stack

- **Data Pipeline**: Python 3.11, xarray, psycopg2
- **Database**: Supabase (PostgreSQL)
- **Cache**: Firestore
- **Frontend**: Vanilla JavaScript, HTML, CSS (no build)
- **Hosting**: Firebase Hosting
- **Scheduler**: GitHub Actions (free)
- **Data**: NOAA GFS via ERDDAP

## 📚 Operacje

### Sprawdzenie ostatniej synchronizacji

```sql
SELECT * FROM sync_logs ORDER BY created_at DESC LIMIT 1;
```

### Pobranie danych dla lokalizacji

```sql
SELECT * FROM weather_data 
WHERE latitude = 51.25 AND longitude = 22.50
ORDER BY forecast_time DESC 
LIMIT 24;
```

### Wymazeanie starych danych (> 365 dni)

```sql
DELETE FROM weather_data 
WHERE forecast_time < NOW() - INTERVAL '365 days';
```

## 💰 Koszty (Free Tier)

| Usługa | Free Tier | Limit |
|--------|-----------|-------|
| Supabase | 500 MB | Storage + API |
| Firebase Hosting | Unlimited | Bandwidth |
| Firestore | 1 GB | Storage + queries |
| GitHub Actions | 2,000 min/mth | Unlimited for public repos |

**Total cost: $0/mth** ✅

## 🐛 Debugging

Logi GitHub Actions:
```
GitHub → Actions → Fetch Weather Data → Latest run → logs
```

Logi Supabase:
```sql
SELECT * FROM sync_logs WHERE status = 'error' ORDER BY created_at DESC;
```

## 📖 Dokumentacja

Szczegóły architekturalne: [`CLAUDE.md`](CLAUDE.md)

---

**Źródła danych**: NOAA GFS (Global Forecast System)  
**Aktualizacja**: codziennie o 2 AM UTC  
**Obszar**: Lubelszczyzna (50.2°N–52.2°N, 21.8°E–24.2°E)
