"""
Klient do pobierania danych z NOAA ERDDAP.
"""
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Tuple
import xarray as xr
import numpy as np
from config import ERDDAP_BASE_URL, ERDDAP_DATASET_ID, BBOX_NORTH, BBOX_SOUTH, BBOX_EAST, BBOX_WEST
from src.utils import is_within_bbox, format_location_name

logger = logging.getLogger(__name__)


class ERDDAPClient:
    """Klient do NOAA GFS ERDDAP dla pobierania danych meteorologicznych."""

    def __init__(self):
        self.base_url = ERDDAP_BASE_URL
        self.dataset_id = ERDDAP_DATASET_ID
        self.logger = logger

    def fetch_gfs_data(self, days_back: int = 1) -> xr.Dataset:
        """
        Pobiera dane GFS z ERDDAP dla ostatnich N dni w obszarze Lubelszczyzny.

        MVP: Zwraca mock dane zamiast ERDDAP (dla testów, zanim API będzie dostępne).

        Args:
            days_back: Liczba dni wstecz do pobrania (domyślnie ostatni dzień)

        Returns:
            xarray.Dataset ze zmiennymi meteorologicznymi
        """
        import pandas as pd
        import random
        import math
        from src.supabase_client import SupabaseClient

        self.logger.info(f"Pobieranie danych GFS dla okresu (MOCK DATA dla miast z bazy)")

        supabase = SupabaseClient()
        cities = []
        try:
            if supabase.connect():
                cities = supabase.get_records("cities", "select=latitude,longitude")
                supabase.close()
        except Exception as e:
            self.logger.warning(f"Nie udało się pobrać miast z Supabase: {e}")

        # Fallback na wypadek braku połączenia lub pustej bazy
        if not cities:
            cities = [
                {"latitude": 52.25, "longitude": 21.0}, # Warszawa
                {"latitude": 51.5, "longitude": 23.5},  # Włodawa
                {"latitude": 51.25, "longitude": 22.5}, # Lublin
                {"latitude": 51.0, "longitude": 17.0},  # Wrocław
                {"latitude": 50.0, "longitude": 19.95}, # Kraków (uwaga: Kraków ma 19.95)
            ]

        times = [datetime.utcnow() - timedelta(hours=i) for i in range(24)]

        records = []
        for t in times:
            for city in cities:
                lat = city['latitude']
                lon = city['longitude']
                # Symulacja realistycznej temperatury dobowej i zależności od szerokości geograficznej
                temp_base = 14.0 + (52.0 - lat) * 2.0  # cieplej na południu
                hour_factor = -math.cos((t.hour - 3) * math.pi / 12) * 5.0  # dobowy cykl temperatury (min o 3:00, max o 15:00)
                temp = temp_base + hour_factor + random.uniform(-1.5, 1.5)

                records.append({
                    'time': t,
                    'latitude': lat,
                    'longitude': lon,
                    'air_temperature': round(temp, 1),
                    'eastward_wind': round(random.uniform(-3, 3), 1),
                    'northward_wind': round(random.uniform(-3, 3), 1),
                    'Total_precipitation': round(max(0.0, random.uniform(-2, 1)), 1),
                    'Cloud_cover_total': round(random.uniform(0, 100), 0)
                })

        df = pd.DataFrame(records)
        self.logger.info(f"✓ Mock dane: {len(df)} rekordów dla {len(cities)} miast")

        # Konwertuj do xarray
        ds = xr.Dataset.from_dataframe(df.set_index(['time', 'latitude', 'longitude']))
        return ds

    def parse_to_records(self, ds: xr.Dataset, grid_step: float = 0.25) -> List[Dict]:
        """
        Transformuje xarray Dataset do listy rekordów (każdy punkt siatki = jeden rekord).

        Args:
            ds: xarray Dataset z danymi meteorologicznymi
            grid_step: Krok siatki geograficznej (domyślnie 0.25°)

        Returns:
            Lista słowników z danymi przygotowanymi do Supabase
        """
        records = []

        # Iteruj po wymiarach
        for time_idx, time_val in enumerate(ds['time'].values):
            forecast_time = np.datetime64(time_val)

            for lat_idx, lat_val in enumerate(ds['latitude'].values):
                for lon_idx, lon_val in enumerate(ds['longitude'].values):
                    lat = float(lat_val)
                    lon = float(lon_val)

                    # Sprawdź czy punkt jest w obszarze
                    if not is_within_bbox(lat, lon, BBOX_NORTH, BBOX_SOUTH, BBOX_EAST, BBOX_WEST):
                        continue

                    try:
                        # Pobierz wartości ze zmiennymi
                        temp = float(ds['air_temperature'].isel(
                            time=time_idx, latitude=lat_idx, longitude=lon_idx
                        ).values) if 'air_temperature' in ds else None

                        u_wind = float(ds['eastward_wind'].isel(
                            time=time_idx, latitude=lat_idx, longitude=lon_idx
                        ).values) if 'eastward_wind' in ds else None

                        v_wind = float(ds['northward_wind'].isel(
                            time=time_idx, latitude=lat_idx, longitude=lon_idx
                        ).values) if 'northward_wind' in ds else None

                        precip = float(ds['Total_precipitation'].isel(
                            time=time_idx, latitude=lat_idx, longitude=lon_idx
                        ).values) if 'Total_precipitation' in ds else None

                        cloud = float(ds['Cloud_cover_total'].isel(
                            time=time_idx, latitude=lat_idx, longitude=lon_idx
                        ).values) if 'Cloud_cover_total' in ds else None

                        # Oblicz wiatr
                        from src.utils import calculate_wind_speed, calculate_wind_direction
                        wind_speed = calculate_wind_speed(u_wind, v_wind) if u_wind and v_wind else None
                        wind_dir = calculate_wind_direction(u_wind, v_wind) if u_wind and v_wind else None

                        record = {
                            "latitude": lat,
                            "longitude": lon,
                            "location_name": format_location_name(lat, lon),
                            "forecast_time": str(forecast_time),
                            "data_source": "NOAA_GFS",
                            "temperature_2m": temp,
                            "u_wind_10m": u_wind,
                            "v_wind_10m": v_wind,
                            "wind_speed_10m": wind_speed,
                            "wind_direction_10m": wind_dir,
                            "precipitation_6h": precip,
                            "cloud_cover_total": cloud,
                        }
                        records.append(record)
                    except Exception as e:
                        self.logger.warning(f"Błąd przy parsowaniu ({lat}, {lon}): {e}")
                        continue

        self.logger.info(f"✓ Sparsowano {len(records)} rekordów")
        return records
