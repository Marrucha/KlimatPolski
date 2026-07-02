#!/usr/bin/env python3
"""
Pobieranie historycznych danych ERA5 dla 23 miast Polski (1950-2026).
Pobiera dane w małych chunkach (domyślnie 2 lata) aby zmieścić się w limitach CDS API.
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
import argparse

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


def fetch_era5_chunk(start_year: int, end_year: int, variables: list, bbox: list, city_name: str) -> str:
    """Pobiera ERA5 dla okresu (np. 2-letni chunk)."""
    logger.info(f"  {start_year}-{end_year}...")

    client = cdsapi.Client(url=CDS_URL, key=CDS_API_KEY)
    output_file = f"era5_{city_name}_{start_year}_{end_year}.download"

    years = [str(y) for y in range(start_year, end_year + 1)]
    months = [f"{m:02d}" for m in range(1, 13)]
    days = [f"{d:02d}" for d in range(1, 32)]

    hours = ['03:00', '09:00', '15:00', '21:00']

    request = {
        'product_type': 'reanalysis',
        'data_format': 'netcdf',
        'area': bbox,
        'year': years,
        'month': months,
        'day': days,
        'time': hours,
        'variable': variables,
    }

    client.retrieve('reanalysis-era5-single-levels', request, output_file)
    return output_file


def parse_era5_to_records(download_file: str, city_id: int, city_name: str) -> list:
    """Parsuje plik pobrany z ERA5 do rekordów dla Supabase."""
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
                            pass  # Already in mm, no conversion needed
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


def fetch_city_data(city, start_year, end_year, chunk_size, variables):
    """Pobiera dane dla jednego miasta - chunk po chunk."""
    city_id = city['id']
    city_name = city['name']
    lat = city['latitude']
    lon = city['longitude']
    # CDS wymaga regionu [north, west, south, east] z min 0.25° range
    bbox = [lat + 0.125, lon - 0.125, lat - 0.125, lon + 0.125]

    supabase = SupabaseClient()
    if not supabase.connect():
        logger.error(f"Nie można się połączyć z Supabase dla {city_name}")
        return 0

    logger.info(f"\n>>> MIASTO: {city_name} (ID: {city_id})")

    total = 0
    year = start_year
    while year <= end_year:
        chunk_end = min(year + chunk_size - 1, end_year)
        download_file = None

        try:
            download_file = fetch_era5_chunk(year, chunk_end, variables, bbox, city_name)
            time.sleep(1)

            records = parse_era5_to_records(download_file, city_id, city_name)

            if records:
                inserted, _ = supabase.insert_weather_records(records)
                total += inserted
                logger.info(f"  ✓ {year}-{chunk_end}: +{inserted}")
            else:
                logger.warning(f"  ⚠ {year}-{chunk_end}: brak danych")

        except Exception as e:
            logger.warning(f"  ✗ {year}-{chunk_end}: {e}")

        finally:
            if download_file and os.path.exists(download_file):
                try:
                    os.remove(download_file)
                except:
                    pass

        year = chunk_end + 1

    logger.info(f"✓ {city_name}: wstawiono łącznie {total} rekordów")
    supabase.close()
    return total


def bulk_fetch_era5(start_year: int = 1950, end_year: int = 2026, chunk_size: int = 1, max_workers: int = 2):
    """Pobiera dane ERA5 dla miast równolegle, rok po roku."""
    logger.info("=" * 60)
    logger.info(f"START: Bulk fetch ERA5: {start_year}-{end_year} (chunk: {chunk_size} rok, workers: {max_workers})")
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

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(fetch_city_data, city, start_year, end_year, chunk_size, variables): city
            for city in cities
        }

        for future in as_completed(futures):
            city = futures[future]
            try:
                records = future.result()
                total_records += records
            except Exception as e:
                logger.error(f"✗ {city['name']}: {e}")

    logger.info("\n" + "=" * 60)
    logger.info(f"✓ GOTOWE: Wstawiono łącznie {total_records} rekordów")
    logger.info("=" * 60)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Bulk fetch ERA5 data')
    parser.add_argument('--city-id', default='all', help='City ID to fetch (or "all")')
    parser.add_argument('--start-year', type=int, default=1950, help='Start year')
    parser.add_argument('--end-year', type=int, default=2026, help='End year')
    parser.add_argument('--chunk-size', type=int, default=1, help='Chunk size in years')
    parser.add_argument('--workers', '-w', type=int, default=2, help='Number of parallel workers (default: 2)')

    args = parser.parse_args()

    start_year = args.start_year
    end_year = args.end_year
    chunk_size = args.chunk_size
    workers = args.workers
    city_id_filter = args.city_id if args.city_id != 'all' else None

    if city_id_filter:
        setup_cds_credentials()
        supabase = SupabaseClient()
        if supabase.connect():
            cities = get_cities_from_db(supabase)
            supabase.close()

            city = next((c for c in cities if c['id'] == int(city_id_filter)), None)
            if city:
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
                total = fetch_city_data(city, start_year, end_year, chunk_size, variables)
                logger.info(f"\n✓ Pobrano dla {city['name']}: {total} rekordów")
            else:
                logger.error(f"Miasto o ID {city_id_filter} nie znalezione")
        else:
            logger.error("Nie można się połączyć z Supabase")
    else:
        bulk_fetch_era5(start_year=start_year, end_year=end_year, chunk_size=chunk_size, max_workers=workers)
