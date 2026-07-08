#!/usr/bin/env python3
"""
Przelicza tabelę daily_stats od zera na podstawie pełnej historii z weather_data.

Naprawia sytuację, w której bulk_fetch_era5.py uzupełnił dane surowe (weather_data)
na wiele lat wstecz, ale daily_stats zostało policzone tylko dla części zakresu
(daily_stats jest normalnie agregowane wyłącznie przez codzienny fetch_data.py,
dla świeżo pobranego dnia).

Użycie:
    python scripts/backfill_daily_stats.py --city-id 39
    python scripts/backfill_daily_stats.py --city-id all
"""
import os
import sys
import time
import logging
import argparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import LOG_LEVEL
from src.supabase_client import SupabaseClient
from src.aggregator import DataAggregator

logging.basicConfig(
    level=LOG_LEVEL,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

WEATHER_FIELDS = (
    "forecast_time,temperature_2m,wind_speed_10m,wind_direction_10m,wind_gust_10m,"
    "precipitation_6h,snowfall_6h,cloud_cover_total,pressure_msl,"
    "dewpoint_temperature_2m,relative_humidity_2m,sea_surface_temperature"
)


def fetch_all_weather_records(supabase: SupabaseClient, city_id: int, page_size: int = 1000):
    """Pobiera wszystkie rekordy weather_data dla miasta, stronicując po forecast_time."""
    offset = 0
    while True:
        query = (
            f"city_id=eq.{city_id}&select={WEATHER_FIELDS}"
            f"&order=forecast_time.asc&limit={page_size}&offset={offset}"
        )
        page = supabase.get_records("weather_data", query)
        if not page:
            break
        yield page
        if len(page) < page_size:
            break
        offset += page_size


def backfill_city(supabase: SupabaseClient, city_id: int, city_name: str,
                   latitude: float, longitude: float) -> None:
    logger.info(f"=== Przeliczanie daily_stats dla {city_name} (ID: {city_id}) ===")
    location_name = f"{latitude:.2f}N, {longitude:.2f}E"

    total_records = 0
    total_stats_written = 0
    pending = []

    for page in fetch_all_weather_records(supabase, city_id):
        total_records += len(page)
        pending.extend(page)

        # Przelicz i wyślij co ~50k surowych rekordów, żeby nie trzymać
        # całej historii w pamięci naraz
        if len(pending) >= 50_000:
            stats = DataAggregator.aggregate_daily_stats_by_city(
                pending, city_id, latitude, longitude, location_name)
            written = supabase.upsert_daily_stats_direct(stats)
            total_stats_written += written
            logger.info(f"  ... {total_records} rekordów przetworzonych, {total_stats_written} dni zapisanych")
            pending = []

    if pending:
        stats = DataAggregator.aggregate_daily_stats_by_city(
            pending, city_id, latitude, longitude, location_name)
        written = supabase.upsert_daily_stats_direct(stats)
        total_stats_written += written

    logger.info(f"✓ {city_name}: {total_records} rekordów surowych -> {total_stats_written} dni w daily_stats")


def main():
    parser = argparse.ArgumentParser(description="Przelicza daily_stats z pełnej historii weather_data")
    parser.add_argument("--city-id", required=True, help="ID miasta lub 'all'")
    args = parser.parse_args()

    start_time = time.time()
    supabase = SupabaseClient()

    if not supabase.connect():
        logger.error("✗ Brak połączenia z Supabase")
        return 1

    cities = supabase.get_records("cities", "select=id,name,latitude,longitude")
    if not cities:
        logger.error("✗ Brak miast w bazie")
        return 1

    if args.city_id == "all":
        targets = cities
    else:
        city_id = int(args.city_id)
        targets = [c for c in cities if c["id"] == city_id]
        if not targets:
            logger.error(f"✗ Nie znaleziono miasta o ID {city_id}")
            return 1

    for city in targets:
        backfill_city(supabase, city["id"], city["name"], city["latitude"], city["longitude"])

    logger.info(f"✓ Zakończono w {time.time() - start_time:.1f}s")
    supabase.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
