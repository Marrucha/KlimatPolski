"""
Klient do Supabase REST API - wstawienie i aktualizacja danych pogodowych.
"""
import logging
import json
from typing import List, Dict
from datetime import datetime
import requests
from config import SUPABASE_URL, SUPABASE_KEY, SUPABASE_TABLE_WEATHER, SUPABASE_TABLE_DAILY_STATS, SUPABASE_TABLE_SYNC_LOGS

logger = logging.getLogger(__name__)


class SupabaseClient:
    """Klient do Supabase REST API dla danych meteorologicznych."""

    def __init__(self):
        self.base_url = SUPABASE_URL
        self.api_key = SUPABASE_KEY
        self.headers = {
            "apikey": self.api_key,
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        }

    def connect(self) -> bool:
        """Sprawdza czy Supabase API jest dostępne."""
        try:
            response = requests.get(
                f"{self.base_url}/rest/v1/",
                headers=self.headers,
                timeout=10
            )
            if response.status_code in [200, 204]:
                logger.info("✓ Połączono z Supabase")
                return True
            else:
                logger.error(f"✗ Błąd połączenia: {response.status_code}")
                return False
        except Exception as e:
            logger.error(f"✗ Błąd połączenia z Supabase: {e}")
            return False

    def close(self):
        """Noop - REST API nie wymaga zamykania."""
        logger.info("REST API (brak połączenia do zamknięcia)")

    def insert_weather_records(self, records: List[Dict]) -> tuple:
        """
        Wstawia rekordy pogodowe przez REST API.

        Args:
            records: Lista słowników z danymi pogodowymi

        Returns:
            (inserted_count, updated_count)
        """
        if not records:
            return 0, 0

        try:
            # Podziel na batche (Supabase limit ~1000)
            batch_size = 500
            total_inserted = 0

            for i in range(0, len(records), batch_size):
                batch = records[i:i+batch_size]

                response = requests.post(
                    f"{self.base_url}/rest/v1/{SUPABASE_TABLE_WEATHER}",
                    headers=self.headers,
                    json=batch,
                    timeout=30
                )

                if response.status_code in [200, 201]:
                    total_inserted += len(batch)
                    logger.info(f"✓ Wstawiono batch {i//batch_size + 1}: {len(batch)} rekordów")
                else:
                    logger.error(f"✗ Błąd przy insercie: {response.status_code} - {response.text}")
                    return total_inserted, 0

            logger.info(f"✓ Wstawiono łącznie {total_inserted} rekordów w weather_data")
            return total_inserted, 0

        except Exception as e:
            logger.error(f"✗ Błąd przy insercie: {e}")
            return 0, 0

    def insert_daily_stats(self, stats: List[Dict]) -> int:
        """
        Wstawia statystyki dzienne przez REST API.

        Args:
            stats: Lista słowników ze statystykami dziennymi

        Returns:
            Liczba wstawionych rekordów
        """
        if not stats:
            return 0

        try:
            response = requests.post(
                f"{self.base_url}/rest/v1/{SUPABASE_TABLE_DAILY_STATS}",
                headers=self.headers,
                json=stats,
                timeout=30
            )

            if response.status_code in [200, 201]:
                logger.info(f"✓ Wstawiono {len(stats)} statystyk dziennych")
                return len(stats)
            else:
                logger.error(f"✗ Błąd przy insercie daily_stats: {response.status_code} - {response.text}")
                return 0

        except Exception as e:
            logger.error(f"✗ Błąd przy insercie daily_stats: {e}")
            return 0

    def log_sync(self, status: str, records_fetched: int, records_inserted: int,
                 records_updated: int, error_msg: str = None, execution_time: float = 0.0):
        """Zapisuje log synchronizacji do Supabase."""
        try:
            log_entry = {
                "sync_timestamp": datetime.utcnow().isoformat(),
                "status": status,
                "records_fetched": records_fetched,
                "records_inserted": records_inserted,
                "records_updated": records_updated,
                "error_message": error_msg,
                "execution_time_seconds": execution_time
            }

            requests.post(
                f"{self.base_url}/rest/v1/{SUPABASE_TABLE_SYNC_LOGS}",
                headers=self.headers,
                json=log_entry,
                timeout=10
            )
            logger.info("✓ Log synchronizacji zapisany")

        except Exception as e:
            logger.error(f"✗ Błąd przy logu: {e}")
