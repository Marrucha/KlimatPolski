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

        Args:
            days_back: Liczba dni wstecz do pobrania (domyślnie ostatni dzień)

        Returns:
            xarray.Dataset ze zmiennymi meteorologicznymi
        """
        import requests

        # Oblicz zakres dat
        end_time = datetime.utcnow()
        start_time = end_time - timedelta(days=days_back)

        time_str_start = start_time.strftime("%Y-%m-%dT%H:%M:%SZ")
        time_str_end = end_time.strftime("%Y-%m-%dT%H:%M:%SZ")

        self.logger.info(f"Pobieranie danych GFS dla okresu {time_str_start} do {time_str_end}")

        # Pobierz dane jako CSV (prostsze od OPeNDAP)
        # Format: każda zmienna oddzielnie z .csv
        variables = {
            'air_temperature': 'temperature',
            'eastward_wind': 'u_wind',
            'northward_wind': 'v_wind',
            'Total_precipitation': 'precipitation',
            'Cloud_cover_total': 'cloud_cover'
        }

        url = (
            f"{self.base_url}/griddap/{self.dataset_id}.csv?"
            f"time%2Clatitude%2Clongitude%2C"
            f"air_temperature%2Ceastward_wind%2Cnorthward_wind%2C"
            f"Total_precipitation%2CCloud_cover_total"
            f"&time%3E={time_str_start}"
            f"&time%3C={time_str_end}"
            f"&latitude%3E={BBOX_SOUTH}"
            f"&latitude%3C={BBOX_NORTH}"
            f"&longitude%3E={BBOX_WEST}"
            f"&longitude%3C={BBOX_EAST}"
        )

        try:
            # Pobierz jako CSV
            response = requests.get(url, timeout=30)
            response.raise_for_status()

            # Zapisz tymczasowo i otwórz z pandas
            import pandas as pd
            from io import StringIO

            df = pd.read_csv(StringIO(response.text))
            self.logger.info(f"✓ Pobrano {len(df)} wierszy z ERDDAP")

            # Konwertuj do xarray (mock dataset)
            ds = xr.Dataset.from_dataframe(df.set_index(['time', 'latitude', 'longitude']))
            return ds
        except Exception as e:
            self.logger.error(f"✗ Błąd przy pobieraniu z ERDDAP: {e}")
            raise

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
