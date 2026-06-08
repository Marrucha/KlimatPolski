#!/usr/bin/env python3
"""
Pobieranie historycznych danych ERA5 dla Lubelszczyzny (2005-2025).
Wstawienie do Supabase w ujęciu miesięcznym (dla oszczędności pamięci i stabilności).

Wymaga:
- ~/.cdsapi z credentials (lub zmienne env CDS_UID, CDS_API_KEY)
- pip install cdsapi
"""
import os
import sys
import logging
from datetime import datetime
import cdsapi
import xarray as xr
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import BBOX_NORTH, BBOX_SOUTH, BBOX_EAST, BBOX_WEST
from src.supabase_client import SupabaseClient
from src.utils import format_location_name, calculate_wind_speed, calculate_wind_direction

logging.basicConfig(level='INFO', format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# CDS Credentials
CDS_UID = os.getenv('CDS_UID', 'c0acab3c-6a02-4941-85fa-5fb00ce939f3')
CDS_API_KEY = os.getenv('CDS_API_KEY', 'c0acab3c-6a02-4941-85fa-5fb00ce939f3')
CDS_URL = 'https://cds.climate.copernicus.eu/api'

# ERA5 Bounding box (Lubelszczyzny)
ERA5_AREA = [BBOX_NORTH, BBOX_WEST, BBOX_SOUTH, BBOX_EAST]


def setup_cds_credentials():
    """Ustawia credentials do CDS API."""
    cds_dir = Path.home() / '.cdsapi'
    if not cds_dir.exists():
        with open(cds_dir, 'w') as f:
            f.write(f"url: {CDS_URL}\nkey: {CDS_API_KEY}\n")
        logger.info("✓ Zapisano CDS credentials")


def fetch_era5_month(year: int, month: int, variables: list) -> str:
    """
    Pobiera wybrane zmienne ERA5 dla danego miesiąca i roku.

    Args:
        year: Rok do pobrania (np. 2020)
        month: Miesiąc do pobrania (1-12)
        variables: Lista zmiennych ERA5 do pobrania

    Returns:
        Ścieżka do pobranego pliku .nc
    """
    logger.info(f"Pobieranie ERA5 dla {year}-{month:02d} (zmienne: {variables})...")

    client = cdsapi.Client(url=CDS_URL, key=CDS_API_KEY)
    output_file = f"era5_all_vars_{year}_{month:02d}.nc"

    request = {
        'product_type': 'reanalysis',
        'data_format': 'netcdf',
        'area': ERA5_AREA,
        'year': str(year),
        'month': f"{month:02d}",
        'day': [f"{d:02d}" for d in range(1, 32)],
        'time': ['00:00', '06:00', '12:00', '18:00'],
        'variable': variables,
    }

    client.retrieve('reanalysis-era5-single-levels', request, output_file)
    logger.info(f"✓ Pobrano {output_file}")
    return output_file


def parse_era5_to_records(netcdf_file: str) -> list:
    """
    Parsuje plik NetCDF ERA5 do rekordów dla Supabase.
    Automatycznie przelicza jednostki oraz prędkość i kierunek wiatru.

    Args:
        netcdf_file: Ścieżka do pliku .nc

    Returns:
        Lista słowników z danymi
    """
    logger.info(f"Parsowanie {netcdf_file}...")

    try:
        ds = xr.open_dataset(netcdf_file, engine='h5netcdf')
    except Exception as e:
        logger.error(f"Błąd przy otwieraniu {netcdf_file}: {e}")
        return []

    # Słownik mapowania zmiennych NetCDF do kolumn w bazie danych
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
        'total_cloud_cover': 'cloud_cover_total'
    }

    # Znajdź nazwę zmiennej czasowej
    time_coords = [c for c in ['time', 'valid_time'] if c in ds.coords or c in ds.variables]
    if not time_coords:
        logger.error(f"Brak zmiennej czasowej w pliku. Współrzędne: {list(ds.coords.keys())}")
        return []
    time_var_name = time_coords[0]

    records = []

    times = ds[time_var_name].values
    lats = ds['latitude'].values
    lons = ds['longitude'].values

    logger.info(f"Wymiary pliku: times={len(times)}, lats={len(lats)}, lons={len(lons)}")

    # Wyciągnij data arrays dla optymalizacji szybkości pętli
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
                        'latitude': lat,
                        'longitude': lon,
                        'location_name': format_location_name(lat, lon),
                        'forecast_time': str(time_val),
                        'data_source': 'ERA5',
                    }

                    u_wind = None
                    v_wind = None

                    # Pobierz wartości dla wszystkich dostępnych zmiennych
                    for db_col, var_da in var_arrays.items():
                        isel_dict = {time_var_name: time_idx, 'latitude': lat_idx, 'longitude': lon_idx}
                        isel_dict = {k: v for k, v in isel_dict.items() if k in var_da.dims}
                        val = float(var_da.isel(**isel_dict).values)

                        # Konwersja jednostek
                        if db_col == 'temperature_2m':
                            if val > 100:  # Z Kelwinów na Celsjusze
                                val = val - 273.15
                        elif db_col == 'precipitation_6h':
                            val = val * 1000.0  # Z metrów na mm
                        elif db_col == 'cloud_cover_total':
                            if val <= 1.0:  # Z ułamka na procenty
                                val = val * 100.0

                        record[db_col] = val

                        if db_col == 'u_wind_10m':
                            u_wind = val
                        elif db_col == 'v_wind_10m':
                            v_wind = val

                    # Oblicz prędkość i kierunek wiatru, jeśli mamy obie składowe (U i V)
                    if u_wind is not None and v_wind is not None:
                        record['wind_speed_10m'] = calculate_wind_speed(u_wind, v_wind)
                        record['wind_direction_10m'] = calculate_wind_direction(u_wind, v_wind)

                    records.append(record)
                except Exception as e:
                    logger.warning(f"Błąd przy parsowaniu ({lat}, {lon}): {e}")
                    continue

    logger.info(f"✓ Sparsowano {len(records)} rekordów")
    return records


def bulk_fetch_era5(start_year: int = 2005, end_year: int = 2025):
    """
    Pobiera dane ERA5 dla zakresu lat w ujęciu miesięcznym i wstawia do Supabase.

    Args:
        start_year: Rok początkowy
        end_year: Rok końcowy (włącznie)
    """
    logger.info("=" * 60)
    logger.info("START: Bulk fetch ERA5 dla Lubelszczyzny (Miesięczny)")
    logger.info("=" * 60)

    setup_cds_credentials()

    supabase = SupabaseClient()
    if not supabase.connect():
        logger.error("Nie można się połączyć z Supabase")
        return

    # Pobieramy wszystkie wymagane zmienne w jednym pliku na miesiąc
    variables = [
        '2m_temperature',
        '10m_u_component_of_wind',
        '10m_v_component_of_wind',
        'total_precipitation',
        'mean_sea_level_pressure',
        '10m_wind_gust',
        'total_cloud_cover'
    ]

    total_records = 0

    for year in range(start_year, end_year + 1):
        for month in range(1, 13):
            logger.info(f"\n>>> OKRES {year}-{month:02d}")

            nc_file = None
            try:
                nc_file = fetch_era5_month(year, month, variables)
                logger.info(f"    Plik pobrany: {nc_file}")

                records = parse_era5_to_records(nc_file)
                logger.info(f"    Sparsowano: {len(records)} rekordów")

                if not records:
                    logger.warning(f"    Brak rekordów dla {year}-{month:02d}")
                    continue

                # Wstaw / Zaktualizuj w Supabase
                inserted, _ = supabase.insert_weather_records(records)
                total_records += inserted

                logger.info(f"    ✓ Wstawiono/zaktualizowano {inserted} rekordów (razem: {total_records})")

            except Exception as e:
                logger.error(f"    ✗ Błąd dla {year}-{month:02d}: {e}")
                continue
            finally:
                # Usuń plik NetCDF, aby oszczędzać miejsce na dysku
                if nc_file and os.path.exists(nc_file):
                    try:
                        os.remove(nc_file)
                        logger.info(f"    ✓ Usunięto plik tymczasowy {nc_file}")
                    except Exception as e:
                        logger.warning(f"    ⚠ Nie udało się usunąć pliku {nc_file}: {e}")

    supabase.close()

    logger.info("\n" + "=" * 60)
    logger.info(f"✓ GOTOWE: Wstawiono łącznie {total_records} rekordów")
    logger.info("=" * 60)


if __name__ == '__main__':
    start_year = int(sys.argv[1]) if len(sys.argv) > 1 else 2005
    end_year = int(sys.argv[2]) if len(sys.argv) > 2 else 2025
    bulk_fetch_era5(start_year=start_year, end_year=end_year)
