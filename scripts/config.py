"""
Konfiguracja: stałe i ustawienia dla pipeline'u pogodowego.
"""
import os
from dotenv import load_dotenv

load_dotenv()

# === SUPABASE ===
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_API_KEY", "")
SUPABASE_TABLE_WEATHER = "weather_data"
SUPABASE_TABLE_DAILY_STATS = "daily_stats"
SUPABASE_TABLE_SYNC_LOGS = "sync_logs"

# === FIRESTORE (opcjonalnie) ===
FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", "")
FIREBASE_PRIVATE_KEY = os.getenv("FIREBASE_PRIVATE_KEY", "")
FIREBASE_CLIENT_EMAIL = os.getenv("FIREBASE_CLIENT_EMAIL", "")

# === NOAA GFS / ERDDAP ===
ERDDAP_BASE_URL = "https://coastwatch.pfeg.noaa.gov/erddap"
ERDDAP_DATASET_ID = "gfsanl"  # GFS Analysis na ERDDAP

# === OBSZAR ZAINTERESOWANIA (Polska) ===
BBOX_NORTH = 56.0
BBOX_SOUTH = 49.0
BBOX_EAST = 24.5
BBOX_WEST = 14.0

# Siatka geograficzna: aproximatnie 0.25° x 0.25°
GRID_STEP = 0.25

# === ZMIENNE METEOROLOGICZNE Z NOAA ===
# Mapowanie zmiennych NOAA GFS do naszych kolumn
VARIABLES_MAPPING = {
    "temperature_2m": "air_temperature",         # °C na wysokości 2m
    "u_wind_10m": "eastward_wind",              # m/s na 10m (składowa U)
    "v_wind_10m": "northward_wind",             # m/s na 10m (składowa V)
    "precipitation_6h": "Total_precipitation",  # mm suma 6h
    "cloud_cover_total": "Cloud_cover_total",   # % zachmurzenie całkowite
}

# === LOGGING ===
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
LOG_FILE = "logs/sync.log"

# === CACHE ===
CACHE_ENABLED = os.getenv("CACHE_ENABLED", "true").lower() == "true"
CACHE_DIR = ".cache"
