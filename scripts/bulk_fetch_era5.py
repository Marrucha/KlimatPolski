#!/usr/bin/env python3
"""
Pobieranie historycznych danych ERA5 dla 23 miast Polski (2005-2025).
Pobiera dla każdego miasta osobno (zmniejszony bbox) aby zmieścić się w limitach API.
Wstawienie do Supabase w ujęciu miesięcznym.

Wymaga:
- ~/.cdsapi z credentials (lub zmienne env CDS_UID, CDS_API_KEY)
- pip install cdsapi
"""
import os
import sys
import logging
import math
import zipfile
import tempfile
import shutil
from datetime import datetime
import cdsapi
import xarray as xr
from pathlib import Path
from dotenv import load_dotenv
from concurrent.futures import ThreadPoolExecutor, as_completed
import time

load_dotenv()

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from src.supabase_client import SupabaseClient
from src.utils import calculate_wind_speed, calculate_wind_direction

logging.basicConfig(level='INFO', format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# CDS Credentials
CDS_UID = os.getenv('CDS_UID', 'c0acab3c-6a02-4941-85fa-5fb00ce939f3')
CDS_API_KEY = os.getenv('CDS_API_KEY', 'c0acab3c-6a02-4941-85fa-5fb00ce939f3')
CDS_URL = 'https://cds.climate.copernicus.eu/api'



def setup_cds_credentials():
    """Ustawia credentials do CDS API."""
    cds_dir = Path.home() / '.cdsapi'
    if not cds_dir.exists():
        with open(cds_dir, 'w') as f:
            f.write(f"url: {CDS_URL}\nkey: {CDS_API_KEY}\n")
        logger.info("✓ Zapisano CDS credentials")


def fetch_era5_period(start_year: int, end_year: int, variables: list, bbox: list, city_name: str) -> str:
    """
    Pobiera ERA5 dla całego okresu (wszystkie miesiące + lata) w jednym request.

    Args:
        start_year: Rok początkowy
        end_year: Rok końcowy
        variables: Lista zmiennych ERA5
        bbox: [north, west, south, east] bounding box
        city_name: Nazwa miasta (do logowania)

    Returns:
        Ścieżka do pobranego pliku
    """
    logger.info(f"Pobieranie ERA5 dla {city_name} {start_year}-{end_year} (cały okres)...")

    client = cdsapi.Client(url=CDS_URL, key=CDS_API_KEY)
    output_file = f"era5_{city_name}_{start_year}_{end_year}.download"

    years = [str(y) for y in range(start_year, end_year + 1)]
    months = [f"{m:02d}" for m in range(1, 13)]
    days = [f"{d:02d}" for d in range(1, 32)]

    request = {
        'product_type': 'reanalysis',
        'data_format': 'netcdf',
        'area': bbox,
        'year': years,
        'month': months,
        'day': days,
        'time': ['00:00', '06:00', '12:00', '18:00'],
        'variable': variables,
    }

    client.retrieve('reanalysis-era5-single-levels', request, output_file)
    logger.info(f"✓ Pobrano {output_file}")
    return output_file


def parse_era5_to_records(download_file: str, city_id: int, city_name: str) -> list:
    """
    Parsuje plik pobrany z ERA5 do rekordów dla Supabase.

    Args:
        download_file: Ścieżka do pliku pobranego
        city_id: ID miasta
        city_name: Nazwa miasta

    Returns:
        Lista słowników z danymi
    """
    logger.info(f"Parsowanie {download_file}...")

    temp_dir = None
    ds = None

    try:
        if zipfile.is_zipfile(download_file):
            logger.info(f"Wykryto plik ZIP. Rozpakowywanie...")
            temp_dir = tempfile.mkdtemp()
            with zipfile.ZipFile(download_file, 'r') as zip_ref:
                zip_ref.extractall(temp_dir)

            nc_files = [os.path.join(temp_dir, f) for f in os.listdir(temp_dir) if f.endswith('.nc')]
            if not nc_files:
                logger.error("Brak plików .nc wewnątrz archiwum ZIP")
                return []

            logger.info(f"Znaleziono pliki .nc do scalenia: {os.listdir(temp_dir)}")
            datasets = []
            for f in nc_files:
                try:
                    datasets.append(xr.open_dataset(f, engine='h5netcdf'))
                except Exception as e:
                    logger.warning(f"Błąd przy otwieraniu pliku składowego {f}: {e}")

            if not datasets:
                logger.error("Nie udało się załadować żadnego pliku .nc z ZIP")
                return []

            ds = xr.merge(datasets, compat='override')
        else:
            ds = xr.open_dataset(download_file, engine='h5netcdf')

    except Exception as e:
        logger.error(f"Błąd ładowania danych: {e}")
        return []

    ERA5_VAR_MAP = {
        't2m': 'temperature_2m',
        '2m_temperature': 'temperature_2m',
        'u10': 'u_wind_10m',
        '10m_u_component_of_wind': 'u_wind_10m',
        'v10': 'v_wind_10m',
        '10m_v_component_of_wind': 'v_wind_10m',
        'tp': 'precipitation_6h',
        'total_precipitation': 'precipitation_6h',
        'tcc': 'cloud_cover_total',
        'total_cloud_cover': 'cloud_cover_total',
        'sst': 'sea_surface_temperature',
        'sea_surface_temperature': 'sea_surface_temperature',
        'msl': 'pressure_msl',
        'mean_sea_level_pressure': 'pressure_msl',
        'fg10': 'wind_gust_10m',
        '10fg': 'wind_gust_10m',
        '10m_wind_gust_since_previous_post_processing': 'wind_gust_10m',
        'sf': 'snowfall_6h',
        'snowfall': 'snowfall_6h',
        'd2m': 'dewpoint_temperature_2m',
        '2m_dewpoint_temperature': 'dewpoint_temperature_2m'
    }

    time_coords = [c for c in ['time', 'valid_time'] if c in ds.coords or c in ds.variables]
    if not time_coords:
        logger.error(f"Brak zmiennej czasowej w pliku. Współrzędne: {list(ds.coords.keys())}")
        if temp_dir and os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)
        return []
    time_var_name = time_coords[0]

    records = []
    times = ds[time_var_name].values
    lats = ds['latitude'].values
    lons = ds['longitude'].values

    logger.info(f"Wymiary pliku: times={len(times)}, lats={len(lats)}, lons={len(lons)}")

    var_arrays = {}
    for var_name in ds.data_vars:
        if var_name in ERA5_VAR_MAP:
            var_arrays[ERA5_VAR_MAP[var_name]] = ds[var_name]

    for time_idx, time_val in enumerate(times):
        for lat_idx, lat_val in enumerate(lats):
            for lon_idx, lon_val in enumerate(lons):
                try:
                    lat = float(lat_val)
                    lon = float(lon_val)

                    record = {
                        'city_id': city_id,
                        'forecast_time': str(time_val),
                        'data_source': 'ERA5',
                    }

                    u_wind = None
                    v_wind = None
                    t2m = None
                    d2m = None

                    for db_col, var_da in var_arrays.items():
                        isel_dict = {time_var_name: time_idx, 'latitude': lat_idx, 'longitude': lon_idx}
                        isel_dict = {k: v for k, v in isel_dict.items() if k in var_da.dims}
                        val = float(var_da.isel(**isel_dict).values)

                        if math.isnan(val) or math.isinf(val):
                            continue

                        if db_col == 'temperature_2m':
                            if val > 100:
                                val = val - 273.15
                            t2m = val
                        elif db_col == 'sea_surface_temperature':
                            if val > 100:
                                val = val - 273.15
                        elif db_col == 'dewpoint_temperature_2m':
                            if val > 100:
                                val = val - 273.15
                            d2m = val
                        elif db_col == 'pressure_msl':
                            val = val / 100.0
                        elif db_col == 'precipitation_6h':
                            val = val * 1000.0
                        elif db_col == 'snowfall_6h':
                            val = val * 1000.0
                        elif db_col == 'cloud_cover_total':
                            if val <= 1.0:
                                val = val * 100.0

                        record[db_col] = val

                        if db_col == 'u_wind_10m':
                            u_wind = val
                        elif db_col == 'v_wind_10m':
                            v_wind = val

                    if u_wind is not None and v_wind is not None:
                        record['wind_speed_10m'] = calculate_wind_speed(u_wind, v_wind)
                        record['wind_direction_10m'] = calculate_wind_direction(u_wind, v_wind)

                    if t2m is not None and d2m is not None:
                        try:
                            numerator = math.exp((17.625 * d2m) / (243.04 + d2m))
                            denominator = math.exp((17.625 * t2m) / (243.04 + t2m))
                            record['relative_humidity_2m'] = min(100.0, max(0.0, 100.0 * (numerator / denominator)))
                        except Exception as e:
                            logger.warning(f"Błąd przy obliczaniu wilgotności: {e}")

                    records.append(record)
                except Exception as e:
                    logger.warning(f"Błąd przy parsowaniu ({lat}, {lon}): {e}")
                    continue

    if temp_dir and os.path.exists(temp_dir):
        try:
            # Zamknij xarray dataset zanim usuniesz plik
            if ds is not None:
                ds.close()
            shutil.rmtree(temp_dir)
            logger.info("✓ Wyczyszczono rozpakowane pliki tymczasowe")
        except Exception as e:
            logger.warning(f"⚠ Nie udało się usunąć katalogu tymczasowego: {e}")

    logger.info(f"✓ Sparsowano {len(records)} rekordów dla {city_name}")
    return records


def get_cities_from_db(supabase) -> list:
    """Pobiera miasta z tabeli cities w Supabase."""
    cities = supabase.get_records('cities')
    if cities:
        logger.info(f"✓ Pobrano {len(cities)} miast z bazy")
    return cities


def fetch_city_data(city, start_year, end_year, variables):
    """Pobiera dane dla jednego miasta - cały okres naraz."""
    city_id = city['id']
    city_name = city['name']
    lat = city['latitude']
    lon = city['longitude']
    bbox = [lat, lon, lat, lon]

    supabase = SupabaseClient()
    if not supabase.connect():
        logger.error(f"Nie można się połączyć z Supabase dla {city_name}")
        return 0

    logger.info(f"\n>>> MIASTO: {city_name} (ID: {city_id}) - pobieranie {start_year}-{end_year}...")

    download_file = None
    try:
        download_file = fetch_era5_period(start_year, end_year, variables, bbox, city_name)
        time.sleep(2)  # Rate limiting między miastami

        records = parse_era5_to_records(download_file, city_id, city_name)

        if not records:
            logger.warning(f"  ⚠ Brak danych dla {city_name}")
            supabase.close()
            return 0

        inserted, _ = supabase.insert_weather_records(records)
        logger.info(f"  ✓ {city_name}: wstawiono {inserted} rekordów")
        supabase.close()
        return inserted

    except Exception as e:
        logger.error(f"  ✗ {city_name}: {e}")
        supabase.close()
        return 0
    finally:
        if download_file and os.path.exists(download_file):
            try:
                os.remove(download_file)
            except:
                pass


def bulk_fetch_era5(start_year: int = 1950, start_month: int = 1, end_year: int = 2025, end_month: int = 12):
    """
    Pobiera dane ERA5 dla miast równolegle (3 miasta naraz).

    Args:
        start_year: Rok początkowy (domyślnie 1950)
        start_month: Miesiąc początkowy (1-12)
        end_year: Rok końcowy (włącznie)
        end_month: Miesiąc końcowy (1-12)
    """
    logger.info("=" * 60)
    logger.info(f"START: Bulk fetch ERA5: {start_year}-{start_month:02d} do {end_year}-{end_month:02d}")
    logger.info("=" * 60)

    setup_cds_credentials()

    supabase = SupabaseClient()
    if not supabase.connect():
        logger.error("Nie można się połączyć z Supabase")
        return

    cities = get_cities_from_db(supabase)
    supabase.close()

    if not cities:
        logger.error("Brak miast w bazie")
        return

    variables = [
        '2m_temperature',
        '10m_u_component_of_wind',
        '10m_v_component_of_wind',
        'total_precipitation',
        'mean_sea_level_pressure',
        '10m_wind_gust_since_previous_post_processing',
        'total_cloud_cover',
        'sea_surface_temperature',
        'snowfall',
        '2m_dewpoint_temperature'
    ]

    total_records = 0

    # Pobierz równolegle dla 2 miast naraz (1 request = cały okres)
    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = {
            executor.submit(fetch_city_data, city, start_year, end_year, variables): city
            for city in cities
        }

        for future in as_completed(futures):
            city = futures[future]
            try:
                records = future.result()
                total_records += records
                logger.info(f"✓ {city['name']}: +{records} rekordów")
            except Exception as e:
                logger.error(f"✗ {city['name']}: {e}")

    logger.info("\n" + "=" * 60)
    logger.info(f"✓ GOTOWE: Wstawiono łącznie {total_records} rekordów")
    logger.info("=" * 60)


if __name__ == '__main__':
    start_year = int(sys.argv[1]) if len(sys.argv) > 1 else 2005
    start_month = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    end_year = int(sys.argv[3]) if len(sys.argv) > 3 else 2025
    end_month = int(sys.argv[4]) if len(sys.argv) > 4 else 12
    bulk_fetch_era5(start_year=start_year, start_month=start_month, end_year=end_year, end_month=end_month)
