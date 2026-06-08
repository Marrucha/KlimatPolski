#!/usr/bin/env python3
"""
Pobieranie historycznych danych ERA5 dla Lubelszczyzny (2005-2025).
Wstawienie do Supabase batch po batch.

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
from src.utils import format_location_name

logging.basicConfig(level='INFO', format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# CDS Credentials
CDS_UID = os.getenv('CDS_UID', 'c0acab3c-6a02-4941-85fa-5fb00ce939f3')
CDS_API_KEY = os.getenv('CDS_API_KEY', 'c0acab3c-6a02-4941-85fa-5fb00ce939f3')
CDS_URL = 'https://cds.climate.copernicus.eu/api'

# ERA5 Bounding box (Lubelszczyzna)
ERA5_AREA = [BBOX_NORTH, BBOX_WEST, BBOX_SOUTH, BBOX_EAST]


def setup_cds_credentials():
    """Ustawia credentials do CDS API."""
    cds_dir = Path.home() / '.cdsapi'
    if not cds_dir.exists():
        with open(cds_dir, 'w') as f:
            f.write(f"url: {CDS_URL}\nkey: {CDS_API_KEY}\n")
        logger.info("✓ Zapisano CDS credentials")


def fetch_era5_year(year: int, variable: str = 'temperature_2m') -> str:
    """
    Pobiera dane ERA5 dla wybranego roku.

    Args:
        year: Rok do pobrania (np. 2020)
        variable: Zmienna ERA5 (temperature_2m, u_wind_10m, v_wind_10m, itd.)

    Returns:
        Ścieżka do pobranego pliku .nc
    """
    logger.info(f"Pobieranie ERA5 {variable} dla {year}...")

    client = cdsapi.Client(url=CDS_URL, key=CDS_API_KEY)

    output_file = f"era5_{variable}_{year}.nc"

    request = {
        'product_type': 'reanalysis',
        'data_format': 'netcdf',
        'area': ERA5_AREA,
        'year': str(year),
        'month': ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'],
        'day': [f"{d:02d}" for d in range(1, 32)],
        'time': ['00:00', '06:00', '12:00', '18:00'],
        'variable': variable,
    }

    client.retrieve('reanalysis-era5-single-levels', request, output_file)
    logger.info(f"✓ Pobrano {output_file}")
    return output_file


def parse_era5_to_records(netcdf_file: str) -> list:
    """
    Parsuje plik NetCDF ERA5 do rekordów dla Supabase.

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

    records = []

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

    # Iteruj po zmiennych i punktach
    for var_name in ds.data_vars:
        if var_name not in ERA5_VAR_MAP:
            logger.info(f"  Pomijam zmienną (brak mapowania kolumny w bazie): {var_name}")
            continue

        db_col_name = ERA5_VAR_MAP[var_name]
        var = ds[var_name]
        logger.info(f"  Zmienna: {var_name} -> {db_col_name}, shape: {var.shape}")

        for time_idx, time_val in enumerate(ds[time_var_name].values):
            for lat_idx, lat_val in enumerate(ds['latitude'].values):
                for lon_idx, lon_val in enumerate(ds['longitude'].values):
                    try:
                        lat = float(lat_val)
                        lon = float(lon_val)
                        
                        isel_dict = {time_var_name: time_idx, 'latitude': lat_idx, 'longitude': lon_idx}
                        isel_dict = {k: v for k, v in isel_dict.items() if k in var.dims}
                        value = float(var.isel(**isel_dict).values)

                        # Konwersja jednostek
                        if db_col_name == 'temperature_2m':
                            if value > 100:  # Z Kelwinów na Celsjusze (ERA5 zwraca w K)
                                value = value - 273.15
                        elif db_col_name == 'precipitation_6h':
                            value = value * 1000.0  # Z metrów na mm (ERA5 zwraca w m)
                        elif db_col_name == 'cloud_cover_total':
                            if value <= 1.0:  # Z ułamka (0-1) na procenty (0-100)
                                value = value * 100.0

                        record = {
                            'latitude': lat,
                            'longitude': lon,
                            'location_name': format_location_name(lat, lon),
                            'forecast_time': str(time_val),
                            'data_source': 'ERA5',
                            db_col_name: value,  # Mapuj na odpowiednią kolumnę w bazie
                        }
                        records.append(record)
                    except Exception as e:
                        logger.warning(f"Błąd przy parsowaniu ({lat}, {lon}): {e}")
                        continue

    logger.info(f"✓ Sparsowano {len(records)} rekordów")
    return records


def bulk_fetch_era5(start_year: int = 2005, end_year: int = 2025):
    """
    Pobiera dane ERA5 dla zakresu lat i wstawia do Supabase.

    Args:
        start_year: Rok początkowy
        end_year: Rok końcowy (włącznie)
    """
    logger.info("=" * 60)
    logger.info("START: Bulk fetch ERA5 dla Lubelszczyzny")
    logger.info("=" * 60)

    setup_cds_credentials()

    supabase = SupabaseClient()
    if not supabase.connect():
        logger.error("Nie można się połączyć z Supabase")
        return

    total_records = 0
    variables = [
        '2m_temperature',
        '10m_u_component_of_wind',
        '10m_v_component_of_wind',
        'total_precipitation',
        'mean_sea_level_pressure',
        '10m_wind_gust',
        'total_cloud_cover'
    ]

    for var in variables:
        logger.info(f"\n>>> ZMIENNA: {var}")

        for year in range(start_year, end_year + 1):
            logger.info(f"  ROK {year}")

            try:
                nc_file = fetch_era5_year(year, var)
                logger.info(f"    Plik pobrany: {nc_file}")

                records = parse_era5_to_records(nc_file)
                logger.info(f"    Sparsowano: {len(records)} rekordów")

                if not records:
                    logger.warning(f"    Brak rekordów dla {year}")
                    continue

                # Wstaw do Supabase
                inserted, _ = supabase.insert_weather_records(records)
                total_records += inserted

                logger.info(f"    ✓ Wstawiono {inserted} rekordów (razem: {total_records})")

            except Exception as e:
                logger.error(f"    ✗ Błąd dla {year}: {e}")
                continue

    supabase.close()

    logger.info("\n" + "=" * 60)
    logger.info(f"✓ GOTOWE: Wstawiono łącznie {total_records} rekordów")
    logger.info("=" * 60)


if __name__ == '__main__':
    import sys
    start_year = int(sys.argv[1]) if len(sys.argv) > 1 else 2005
    end_year = int(sys.argv[2]) if len(sys.argv) > 2 else 2025
    bulk_fetch_era5(start_year=start_year, end_year=end_year)
