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
import math
import zipfile
import tempfile
import shutil
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

# Słownik miast zaokrąglony do siatki ERA5 (0.25°)
# Musi być zsynchronizowany z tabelą cities w Supabase
CITIES = {
    # Lubelszczyzna
    (51.50, 23.50): 1,    # Włodawa
    (51.25, 22.50): 2,    # Lublin
    (51.75, 23.25): 3,    # Biała Podlaska
    (50.75, 23.25): 4,    # Zamość
    (51.25, 23.50): 5,    # Chełm
    (50.75, 21.75): 6,    # Sandomierz
    # Cała Polska
    (52.25, 21.00): 7,    # Warszawa
    (50.00, 19.95): 8,    # Kraków
    (51.00, 17.00): 9,    # Wrocław
    (51.75, 19.50): 10,   # Łódź
    (54.00, 23.00): 11,   # Suwałki
    (54.50, 18.50): 12,   # Gdańsk
    (53.50, 14.50): 13,   # Szczecin
    (50.00, 22.00): 14,   # Rzeszów
    (53.75, 20.50): 15,   # Olsztyn
    (50.75, 21.25): 16,   # Kielce
    (49.25, 20.00): 17,   # Zakopane
    (50.75, 15.75): 18,   # Karpacz
    (54.25, 15.50): 19,   # Kołobrzeg
    (54.50, 18.50): 20,   # Środek zatoki Gdańskiej
    (54.00, 14.25): 21,   # Świnoujście
    (55.00, 18.75): 22,   # Władysławowa
    (55.25, 18.75): 23,   # 20km na północ od Władysławowa
}

def get_city_id(lat: float, lon: float) -> int:
    """Znajdź city_id na podstawie współrzędnych."""
    for (city_lat, city_lon), city_id in CITIES.items():
        if abs(lat - city_lat) < 0.01 and abs(lon - city_lon) < 0.01:
            return city_id
    return None


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
        Ścieżka do pobranego pliku
    """
    logger.info(f"Pobieranie ERA5 dla {year}-{month:02d} (zmienne: {variables})...")

    client = cdsapi.Client(url=CDS_URL, key=CDS_API_KEY)
    # Zapisujemy jako plik pobrany (może to być .nc lub .zip w zależności od tego, jak CDS to spakuje)
    output_file = f"era5_all_vars_{year}_{month:02d}.download"

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


def parse_era5_to_records(download_file: str, allowed_points: list = None) -> list:
    """
    Parsuje plik pobrany z ERA5 do rekordów dla Supabase.
    Automatycznie obsługuje pliki pojedyncze NetCDF oraz spakowane w archiwum ZIP.
    Automatycznie przelicza jednostki, wiatr oraz wilgotność względną.

    Args:
        download_file: Ścieżka do pliku pobranego (.nc lub .zip zapisanego jako .download)

    Returns:
        Lista słowników z danymi
    """
    logger.info(f"Parsowanie {download_file}...")

    temp_dir = None
    ds = None

    try:
        # Sprawdź czy pobrany plik to ZIP (częste przy zapytaniach wielozmiennych w nowym CDS API)
        if zipfile.is_zipfile(download_file):
            logger.info(f"Wykryto plik ZIP. Rozpakowywanie...")
            temp_dir = tempfile.mkdtemp()
            with zipfile.ZipFile(download_file, 'r') as zip_ref:
                zip_ref.extractall(temp_dir)
            
            # Znajdź pliki .nc w rozpakowanej zawartości
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
            
            # Scalamy zbiory danych w jeden obiekt xarray
            ds = xr.merge(datasets, compat='override')
        else:
            # Standardowy plik NetCDF
            ds = xr.open_dataset(download_file, engine='h5netcdf')

    except Exception as e:
        logger.error(f"Błąd ładowania danych: {e}")
        return []
    finally:
        # Pliki tymczasowe zostaną wyczyszczone na końcu funkcji
        pass

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
        'total_cloud_cover': 'cloud_cover_total',
        
        # Nowe zmienne
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

    # Znajdź nazwę zmiennej czasowej
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

                    # Filtruj tylko allowed points jeśli podane
                    if allowed_points:
                        if not any(abs(lat - p[0]) < 0.01 and abs(lon - p[1]) < 0.01 for p in allowed_points):
                            continue

                    # Znajdź city_id
                    city_id = get_city_id(lat, lon)
                    if city_id is None:
                        continue

                    record = {
                        'city_id': city_id,
                        'forecast_time': str(time_val),
                        'data_source': 'ERA5',
                    }

                    u_wind = None
                    v_wind = None
                    t2m = None
                    d2m = None

                    # Pobierz wartości dla wszystkich dostępnych zmiennych
                    for db_col, var_da in var_arrays.items():
                        isel_dict = {time_var_name: time_idx, 'latitude': lat_idx, 'longitude': lon_idx}
                        isel_dict = {k: v for k, v in isel_dict.items() if k in var_da.dims}
                        val = float(var_da.isel(**isel_dict).values)

                        # Pomiń wartości NaN/Inf (np. temperatura wody na lądzie), w bazie zapiszą się jako NULL
                        if math.isnan(val) or math.isinf(val):
                            continue

                        # Konwersja jednostek
                        if db_col == 'temperature_2m':
                            if val > 100:  # Z Kelwinów na Celsjusze
                                val = val - 273.15
                            t2m = val
                        elif db_col == 'sea_surface_temperature':
                            if val > 100:  # Z Kelwinów na Celsjusze
                                val = val - 273.15
                        elif db_col == 'dewpoint_temperature_2m':
                            if val > 100:  # Z Kelwinów na Celsjusze
                                val = val - 273.15
                            d2m = val
                        elif db_col == 'pressure_msl':
                            val = val / 100.0  # Z Pa na hPa
                        elif db_col == 'precipitation_6h':
                            val = val * 1000.0  # Z metrów na mm
                        elif db_col == 'snowfall_6h':
                            val = val * 1000.0  # Z metrów na mm
                        elif db_col == 'cloud_cover_total':
                            if val <= 1.0:  # Z ułamka na procenty
                                val = val * 100.0

                        record[db_col] = val

                        if db_col == 'u_wind_10m':
                            u_wind = val
                        elif db_col == 'v_wind_10m':
                            v_wind = val

                    # Oblicz prędkość i kierunek wiatru
                    if u_wind is not None and v_wind is not None:
                        record['wind_speed_10m'] = calculate_wind_speed(u_wind, v_wind)
                        record['wind_direction_10m'] = calculate_wind_direction(u_wind, v_wind)

                    # Oblicz wilgotność względną z T2m i D2m (formuła Augusta-Roche'a-Magnusa)
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

    # Sprzątanie tymczasowych plików .nc rozpakowanych z zipa
    if temp_dir and os.path.exists(temp_dir):
        try:
            shutil.rmtree(temp_dir)
            logger.info("✓ Wyczyszczono rozpakowane pliki tymczasowe")
        except Exception as e:
            logger.warning(f"⚠ Nie udało się usunąć katalogu tymczasowego: {e}")

    logger.info(f"✓ Sparsowano {len(records)} rekordów")
    return records


def bulk_fetch_era5(start_year: int = 2005, start_month: int = 1, end_year: int = 2025, end_month: int = 12):
    """
    Pobiera dane ERA5 dla zakresu lat i miesięcy w ujęciu miesięcznym i wstawia do Supabase.

    Args:
        start_year: Rok początkowy
        start_month: Miesiąc początkowy (1-12)
        end_year: Rok końcowy (włącznie)
        end_month: Miesiąc końcowy (1-12)
    """
    logger.info("=" * 60)
    logger.info(f"START: Bulk fetch ERA5 dla Lubelszczyzny: {start_year}-{start_month:02d} do {end_year}-{end_month:02d}")
    logger.info("=" * 60)

    setup_cds_credentials()

    supabase = SupabaseClient()
    if not supabase.connect():
        logger.error("Nie można się połączyć z Supabase")
        return

    # Rozszerzona lista zmiennych ERA5
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

    # Tylko 6 miast Lubelszczyzny
    allowed_points = [
        (51.55, 23.57),  # Włodawa
        (51.25, 22.57),  # Lublin
        (51.75, 23.15),  # Biała Podlaska
        (50.72, 23.25),  # Zamość
        (51.18, 23.48),  # Chełm
        (50.68, 21.75),  # Sandomierz
    ]

    total_records = 0

    for year in range(start_year, end_year + 1):
        months = range(1, 13)
        if year == start_year:
            months = range(start_month, 13)
        if year == end_year:
            months = range(1 if year != start_year else start_month, end_month + 1)

        for month in months:
            logger.info(f"\n>>> OKRES {year}-{month:02d}")

            download_file = None
            try:
                download_file = fetch_era5_month(year, month, variables)
                logger.info(f"    Plik pobrany: {download_file}")

                records = parse_era5_to_records(download_file, allowed_points=allowed_points)
                logger.info(f"    Sparsowano: {len(records)} rekordów (6 miast)")

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
                # Usuń plik pobrany, aby oszczędzać miejsce na dysku
                if download_file and os.path.exists(download_file):
                    try:
                        os.remove(download_file)
                        logger.info(f"    ✓ Usunięto plik pobrany {download_file}")
                    except Exception as e:
                        logger.warning(f"    ⚠ Nie udało się usunąć pliku {download_file}: {e}")

    supabase.close()

    logger.info("\n" + "=" * 60)
    logger.info(f"✓ GOTOWE: Wstawiono łącznie {total_records} rekordów")
    logger.info("=" * 60)


if __name__ == '__main__':
    start_year = int(sys.argv[1]) if len(sys.argv) > 1 else 2005
    start_month = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    end_year = int(sys.argv[3]) if len(sys.argv) > 3 else 2025
    end_month = int(sys.argv[4]) if len(sys.argv) > 4 else 12
    bulk_fetch_era5(start_year=start_year, start_month=start_month, end_year=end_year, end_month=end_month)
    bulk_fetch_era5(start_year=start_year, end_year=end_year)
