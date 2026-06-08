# KlimatPolski – Archiwalna pogoda Polski

Interaktywna platforma do analizy danych pogodowych z ostatnich 50 lat dla Polski, oparta na danych ERA5 i NCEP/NCAR.

## Technologia

- **Backend**: Python 3.11+ + FastAPI
- **Frontend**: React 18+ + TypeScript + Vite
- **Storage**: AWS S3 (netCDF files)
- **Data sources**: ERA5 (Copernicus CDS), NCEP/NCAR Reanalysis

## Struktura projektu

```
.
├── backend/              # FastAPI server
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── api/
│   │   │   ├── routes/
│   │   │   └── models/
│   │   ├── data/
│   │   │   ├── fetcher.py      # Pobieranie ERA5/NCEP
│   │   │   ├── processor.py    # Przetwarzanie netCDF
│   │   │   └── storage.py      # S3 operations
│   │   └── services/
│   ├── requirements.txt
│   ├── .env.example
│   └── Dockerfile
├── frontend/             # React app
│   ├── src/
│   │   ├── components/
│   │   │   ├── Map.tsx
│   │   │   ├── Charts.tsx
│   │   │   └── Controls.tsx
│   │   ├── pages/
│   │   ├── services/
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── Dockerfile
├── docker-compose.yml
├── README.md
└── CLAUDE.md           # Ten plik
```

## Features (MVP)

1. **Mapa interaktywna** – wybór lokalizacji na mapie Polski
2. **Histogram temperatury** – rozkład temp. dla wybranego miejsca (np. ostatnie 30 dni)
3. **Graf opadów** – suma opadów w wybranym okresie
4. **Wskaźniki klimatyczne** – średnie, min/max, trendy

## Kolejne kroki

1. ✅ Inicjalizacja projektu (git, struktura)
2. ⬜ Setup backend (FastAPI, requirements)
3. ⬜ Setup frontend (React + Vite)
4. ⬜ Data pipeline (fetch ERA5)
5. ⬜ API endpoints
6. ⬜ Komponenty frontend
7. ⬜ Deployment

## Environment variables

Backend wymaga (`.env`):
```
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_S3_BUCKET=klimatpolski-data
COPERNICUS_UID=
COPERNICUS_PASSWORD=
```

## Notatki dla Claude Code

- Python interpreter: system default lub venv w `backend/`
- Node/npm: zainstalowany globalnie
- Preferuj TypeScript strict mode na frontend
- Backend: type hints wszędzie (mypy)
