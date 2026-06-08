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

        self.logger.info(f"Pobieranie danych GFS dla okresu (MOCK DATA - MVP)")

        # MVP: Mock data dla Lubelszczyzny
        lats = [50.5, 51.0, 51.5, 52.0]
        lons = [22.0, 22.5, 23.0, 23.5, 24.0]
        times = [datetime.utcnow() - timedelta(hours=i) for i in range(24)]

        records = []
        for t in times:
            for lat in lats:
                for lon in lons:
                    records.append({
                        'time': t,
                        'latitude': lat,
                        'longitude': lon,
                        'air_temperature': 15.0 + lat * 0.1,  # Mock: temp depends on lat
                        'eastward_wind': 3.5,
                        'northward_wind': 2.1,
                        'Total_precipitation': 0.5,
                        'Cloud_cover_total': 45.0
                    })

        df = pd.DataFrame(records)
        self.logger.info(f"✓ Mock dane: {len(df)} rekordów dla Lubelszczyzny")

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
