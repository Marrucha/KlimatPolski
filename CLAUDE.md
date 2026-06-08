# Strefa Czystego Internetu – Moduł Pogodowy (Lubelszczyzna)

Automatyczny, bezserwerowy pipeline danych klimatyczno-pogodowych dla województwa lubelskiego. Dane pogodowe (NOAA GFS) codziennie aktualizowane i analizowane z dashboardem webowym.

## Architektura

```
Pipeline danych (Python + GitHub Actions)
    ↓
[NOAA GFS / ERDDAP] → [FetchScript] → [Supabase PostgreSQL]
                           ↓
                      [Agregator] → [Daily Stats]
                           ↓
                      [Firestore Cache]
                           ↓
Frontend (Vanilla JS) → [Supabase REST API] + [Firestore] → [Firebase Hosting]
```

## Technologia

- **Data Pipeline**: Python 3.11, scheduled via GitHub Actions (cron daily)
- **Database**: Supabase (PostgreSQL) – dane surowe i statystyki
- **Cache**: Firestore – agregaty dzienne (oszczędność limitów Supabase)
- **Frontend**: Vanilla JS (HTML/CSS) – lekkie, bez zależności
- **Hosting**: Firebase Hosting (frontend) + Supabase (API)
- **Data Source**: NOAA GFS via ERDDAP

## Struktura katalogów

```
.
├── .github/workflows/
│   └── fetch-weather-data.yml      # Cron scheduler: codziennie 2 AM UTC
├── scripts/
│   ├── fetch_data.py               # Main orchestrator
│   ├── config.py                   # Settings & constants
│   ├── src/
│   │   ├── erddap_client.py        # Pobieranie danych z NOAA
│   │   ├── supabase_client.py      # Write do Supabase
│   │   ├── aggregator.py           # Agregacja statystyk dziennych
│   │   └── utils.py                # Helper functions
│   └── requirements.txt
├── frontend/
│   ├── index.html
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   ├── main.js                 # Logika aplikacji
│   │   ├── api.js                  # Komunikacja z Supabase
│   │   └── charts.js               # Canvas charts
│   └── assets/
├── sql/
│   └── schema.sql                  # Schemat Supabase (run once)
├── firebase.json
├── .env.example
├── requirements.txt
├── README.md
└── CLAUDE.md
```

## Zmienne meteorologiczne

Pobierane z NOAA GFS dla obszaru Lubelszczyzny (50.2°N–52.2°N, 21.8°E–24.2°E):

- **Temperatura** (2m): temperatura powietrza
- **Wiatr** (10m): U/V komponenty → prędkość i kierunek (liczony)
- **Opady**: suma całkowita APCP (6h)
- **Zachmurzenie**: TCDC (%)

## Setup

### 1. Przygotowanie bazy danych

```bash
# Utwórz projekt w Supabase
# Utwórz tabelę (skopiuj sql/schema.sql do SQL Editor w Supabase)

psql -h <host> -U postgres -d postgres -f sql/schema.sql
```

### 2. Konfiguracja środowiska

```bash
cp .env.example .env
# Edytuj .env z Supabase API key i Firebase credentials
```

### 3. GitHub Actions – Secrets

Utwórz w GitHub Settings → Secrets:
- `SUPABASE_URL`
- `SUPABASE_API_KEY`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_CLIENT_EMAIL`

### 4. Test lokalnie

```bash
pip install -r requirements.txt
python scripts/fetch_data.py
```

### 5. Deploy Frontend

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only hosting
```

## Oto co robi każdy moduł

| Moduł | Co robi |
|-------|---------|
| `fetch_data.py` | Orchestrator – koordynuje cały pipeline |
| `erddap_client.py` | Pobiera dane z NOAA GFS (xarray) |
| `supabase_client.py` | Wstawia dane do PostgreSQL (psycopg2 UPSERT) |
| `aggregator.py` | Grupuje dane na statystyki dzienne |
| `api.js` | Komunikacja frontendu z Supabase REST API |
| `charts.js` | Rysuje wykresy (canvas, bez Chart.js) |
| `main.js` | Logika UI i event handling |

## Performance & Cost

- **Supabase**: RLS policies dla publicznego odczytu (FREE TIER)
- **Firestore**: Cache dla daily_stats (oszczędność zapytań)
- **GitHub Actions**: Free tier obejmuje Cron (3 miesiące nieograniczony)
- **Frontend Assets**: Static hosting Firebase (fast, cached)

## Debugging

```bash
# Logowanie skryptu Python
tail -f logs/sync.log

# Sprawdzenie synchronizacji w Supabase
SELECT * FROM sync_logs ORDER BY created_at DESC LIMIT 10;

# Test ERDDAP
curl "https://coastwatch.pfeg.noaa.gov/erddap/griddap/gfsanl.nc?..."
```

## Notatki dla Claude Code

- **Python**: type hints wszędzie, pole `activeForm` w TodoWrite
- **JavaScript**: Vanilla JS, zwięzłe komentarze po polsku
- **Git**: Konwencja: `feat: ...`, `fix: ...`, `docs: ...`
- **Komunikacja**: Polski wszędzie
- **Kod**: Optimized for Free Tier limits (bez wateringu)
