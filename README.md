# KlimatPolski – Archiwalna Pogoda Polski

Interaktywna platforma do analizy danych pogodowych z ostatnich 50 lat dla Polski.

Dane pochodzą z:
- **ERA5** – Copernicus Climate Data Store (0.25° x 0.25°)
- **NCEP/NCAR Reanalysis** – NOAA

## 🚀 Quick Start

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edytuj .env z prawdziwymi credentials
uvicorn app.main:app --reload
```

API dostępny na `http://localhost:8000`

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

App dostępny na `http://localhost:5173`

## 📁 Struktura

```
.
├── backend/              # FastAPI server
├── frontend/             # React + TypeScript
├── CLAUDE.md            # Notatki dla Claude Code
└── README.md
```

## 🔧 Tech Stack

- **Backend**: Python 3.11, FastAPI, xarray, netCDF4
- **Frontend**: React 18, TypeScript, Leaflet, Recharts
- **Storage**: AWS S3
- **Data**: ERA5 (CDS), NCEP/NCAR

## 📋 MVP Features

- [ ] Mapa interaktywna – wybór lokalizacji
- [ ] Historia temperatury – rozkład dla wybranego okresu
- [ ] Historia opadów – suma opadów
- [ ] Wskaźniki klimatyczne – śr., min/max

## 🔐 Credentials

Wymagane zmienne `.env`:

**Backend**:
```
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
COPERNICUS_UID=...
COPERNICUS_PASSWORD=...
```

**Frontend**:
```
VITE_API_URL=http://localhost:8000/api
```

## 📚 Linki

- [ERA5 CDS](https://cds.climate.copernicus.eu/)
- [NCEP/NCAR Reanalysis](https://psl.noaa.gov/data/gridded/data.ncep.reanalysis.html)

---

Patrz `CLAUDE.md` dla szczegółów architektonicznych.
