"""
Funkcje utility: obliczenia wiatru, transformacje danych, logowanie.
"""
import math
import logging
from datetime import datetime
from typing import Tuple
from config import LOG_LEVEL, LOG_FILE

# === LOGGER ===
logging.basicConfig(
    level=LOG_LEVEL,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


def calculate_wind_speed(u_wind: float, v_wind: float) -> float:
    """
    Oblicza prędkość wiatru ze składowych wektora.

    Args:
        u_wind: Składowa U wiatru (m/s) - wschód-zachód
        v_wind: Składowa V wiatru (m/s) - północ-południe

    Returns:
        Prędkość wiatru w m/s
    """
    return math.sqrt(u_wind**2 + v_wind**2)


def calculate_wind_direction(u_wind: float, v_wind: float) -> float:
    """
    Oblicza kierunek wiatru w stopniach (0-360°).

    Konwencja meteorologiczna: 0° = północ, 90° = wschód, 180° = południe, 270° = zachód.

    Args:
        u_wind: Składowa U (m/s)
        v_wind: Składowa V (m/s)

    Returns:
        Kierunek wiatru w stopniach (0-360)
    """
    if u_wind == 0 and v_wind == 0:
        return 0.0

    # atan2(U, V) * 180 / π, następnie normalizacja do 0-360
    direction = math.degrees(math.atan2(u_wind, v_wind))
    return (direction + 360) % 360


def is_within_bbox(lat: float, lon: float,
                   north: float, south: float,
                   east: float, west: float) -> bool:
    """
    Sprawdza, czy punkt (lat, lon) jest w bounding box.
    """
    return south <= lat <= north and west <= lon <= east


def log_sync_event(status: str, records_fetched: int, records_inserted: int,
                   records_updated: int, error_msg: str = None,
                   execution_time: float = 0.0) -> dict:
    """
    Zwraca słownik do logu synchronizacji w Supabase.
    """
    return {
        "sync_timestamp": datetime.utcnow().isoformat(),
        "status": status,
        "records_fetched": records_fetched,
        "records_inserted": records_inserted,
        "records_updated": records_updated,
        "error_message": error_msg,
        "execution_time_seconds": execution_time
    }


def format_location_name(lat: float, lon: float) -> str:
    """
    Generuje etykietę dla lokalizacji.
    """
    return f"{lat:.2f}N, {lon:.2f}E"
