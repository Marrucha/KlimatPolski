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

sys.path.insert(0, '/app/scripts')

from config import SUPABASE_URL, SUPABASE_KEY, BBOX_NORTH, BBOX_SOUTH, BBOX_EAST, BBOX_WEST
from src.supabase_client import SupabaseClient
from src.utils import calculate_wind_speed, calculate_wind_direction, format_location_name

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
            f.write(f"url: {CDS_URL}\nkey: {CDS_UID}:{CDS_API_KEY}\n")
        logger.info("✓ Zapisano CDS credentials")


def fetch_era5_year(year: int, variable: str = 'temperature_2m') -> str:
    """
    Pobiera dane ERA5 dla wybranego roku.

    Args:
        year: Rok do pobrania (np. 2020)
        variable: Zmienna ERA5 (temperature_2m, u_wind_10m, v_wind_10m, itd.)

    Returns:
        Ścieżka do pobranego pliku .grib
    """
    logger.info(f"Pobieranie ERA5 {variable} dla {year}...")

    client = cdsapi.Client(url=CDS_URL, key=f"{CDS_UID}:{CDS_API_KEY}")

    output_file = f"era5_{variable}_{year}.grib"

    request = {
        'product_type': 'reanalysis',
        'format': 'grib',
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


def parse_era5_to_records(grib_file: str) -> list:
    """
    Parsuje plik GRIB ERA5 do rekordów dla Supabase.

    Args:
        grib_file: Ścieżka do pliku .grib

    Returns:
        Lista słowników z danymi
    """
    logger.info(f"Parsowanie {grib_file}...")

    try:
        ds = xr.open_dataset(grib_file, engine='cfgrib')
    except Exception as e:
        logger.error(f"Błąd przy otwieraniu {grib_file}: {e}")
        return []

    records = []

    # Iteruj po zmiennych i punktach
    for var_name in ds.data_vars:
        var = ds[var_name]
        logger.info(f"  Zmienna: {var_name}, shape: {var.shape}")

        for time_idx, time_val in enumerate(ds['time'].values):
            for lat_idx, lat_val in enumerate(ds['latitude'].values):
                for lon_idx, lon_val in enumerate(ds['longitude'].values):
                    try:
                        lat = float(lat_val)
                        lon = float(lon_val)
                        value = float(var.isel(time=time_idx, latitude=lat_idx, longitude=lon_idx).values)

                        record = {
                            'latitude': lat,
                            'longitude': lon,
                            'location_name': format_location_name(lat, lon),
                            'forecast_time': str(time_val),
                            'data_source': 'ERA5',
                            var_name: value,  # Mapuj zmienną ERA5
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

    for year in range(start_year, end_year + 1):
        logger.info(f"\n>>> ROK {year}")

        try:
            # Pobierz temperaturę
            grib_temp = fetch_era5_year(year, 'temperature_2m')
            records_temp = parse_era5_to_records(grib_temp)

            # TODO: Pobierz wiatr (u, v) i inne zmienne
            # grib_u = fetch_era5_year(year, 'u_component_of_wind')
            # records_u = parse_era5_to_records(grib_u)

            # Merge records
            records = records_temp  # + records_u + ...

            if not records:
                logger.warning(f"Brak rekordów dla {year}")
                continue

            # Wstaw do Supabase
            inserted, _ = supabase.insert_weather_records(records)
            total_records += inserted

            logger.info(f"✓ {year}: wstawiono {inserted} rekordów (razem: {total_records})")

        except Exception as e:
            logger.error(f"✗ Błąd dla {year}: {e}")
            continue

    supabase.close()

    logger.info("\n" + "=" * 60)
    logger.info(f"✓ GOTOWE: Wstawiono łącznie {total_records} rekordów")
    logger.info("=" * 60)


if __name__ == '__main__':
    bulk_fetch_era5(start_year=2020, end_year=2025)  # Start od 2020 dla testu
