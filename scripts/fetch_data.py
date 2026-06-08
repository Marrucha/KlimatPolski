#!/usr/bin/env python3
"""
Główny skrypt synchronizacji danych pogodowych.

Pipeline:
1. Pobierz dane z NOAA ERDDAP (ostatnie 24h)
2. Sparsuj do rekordów
3. Wstaw do Supabase (weather_data)
4. Oblicz statystyki dzienne
5. Wstaw do Supabase (daily_stats)
6. Zaloguj synchronizację

Przeznaczony do uruchomienia przez GitHub Actions (cron raz dziennie).
"""
import sys
import time
import logging
from datetime import datetime

# Dodaj scripts/ do ścieżki
sys.path.insert(0, '/app/scripts')

from config import LOG_LEVEL
from src.erddap_client import ERDDAPClient
from src.supabase_client import SupabaseClient
from src.aggregator import DataAggregator
from src.utils import log_sync_event

# Setup loggingu
logging.basicConfig(
    level=LOG_LEVEL,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def main():
    """Główna funkcja pipeline'u."""
    start_time = time.time()
    status = "success"
    error_msg = None
    records_fetched = 0
    records_inserted = 0

    try:
        logger.info("=" * 60)
        logger.info("START: Synchronizacja danych pogodowych")
        logger.info("=" * 60)

        # === KROK 1: Pobierz dane z ERDDAP ===
        logger.info("\n[1/5] Pobieranie danych z NOAA ERDDAP...")
        erddap = ERDDAPClient()
        ds = erddap.fetch_gfs_data(days_back=1)

        # === KROK 2: Sparsuj do rekordów ===
        logger.info("\n[2/5] Parsing danych...")
        records = erddap.parse_to_records(ds, grid_step=0.25)
        records_fetched = len(records)
        logger.info(f"✓ Sparsowano {records_fetched} rekordów")

        if records_fetched == 0:
            logger.warning("⚠ Brak rekordów do wstawienia!")
            status = "partial"

        # === KROK 3: Wstaw do Supabase (weather_data) ===
        logger.info("\n[3/5] Wstawianie danych do Supabase...")
        supabase = SupabaseClient()

        if supabase.connect():
            inserted, updated = supabase.insert_weather_records(records)
            records_inserted = inserted

            # === KROK 4: Oblicz statystyki dzienne ===
            logger.info("\n[4/5] Agregacja danych dziennych...")
            daily_stats = DataAggregator.aggregate_daily_stats(records)

            # === KROK 5: Wstaw statystyki do Supabase ===
            logger.info("\n[5/5] Wstawianie statystyk dziennych...")
            stats_inserted = supabase.insert_daily_stats(daily_stats)

            # === LOGGING ===
            execution_time = time.time() - start_time
            supabase.log_sync(status, records_fetched, records_inserted, 0,
                            error_msg, execution_time)

            logger.info("\n" + "=" * 60)
            logger.info("✓ SUKCES: Synchronizacja ukończona")
            logger.info(f"  - Pobrano: {records_fetched} rekordów")
            logger.info(f"  - Wstawiono: {records_inserted} rekordów")
            logger.info(f"  - Statystyk dziennych: {stats_inserted}")
            logger.info(f"  - Czas wykonania: {execution_time:.2f}s")
            logger.info("=" * 60)

            supabase.close()
            return 0
        else:
            status = "error"
            error_msg = "Brak połączenia z Supabase"
            logger.error(error_msg)
            return 1

    except Exception as e:
        status = "error"
        error_msg = str(e)
        logger.exception(f"✗ BŁĄD: {error_msg}")

        # Spróbuj zalogować błąd
        try:
            execution_time = time.time() - start_time
            supabase = SupabaseClient()
            if supabase.connect():
                supabase.log_sync(status, records_fetched, records_inserted, 0,
                                error_msg, execution_time)
                supabase.close()
        except:
            pass

        logger.info("=" * 60)
        return 1


if __name__ == "__main__":
    sys.exit(main())
