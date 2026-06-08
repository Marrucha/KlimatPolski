"""
Klient do Supabase (PostgreSQL) - wstawienie i aktualizacja danych pogodowych.
"""
import logging
from typing import List, Dict, Tuple
from datetime import datetime
import psycopg2
from psycopg2.extras import execute_values
from psycopg2 import sql
from config import SUPABASE_URL, SUPABASE_KEY, SUPABASE_TABLE_WEATHER, SUPABASE_TABLE_DAILY_STATS, SUPABASE_TABLE_SYNC_LOGS

logger = logging.getLogger(__name__)


class SupabaseClient:
    """Klient do bazy Supabase (PostgreSQL) dla danych meteorologicznych."""

    def __init__(self):
        self.supabase_url = SUPABASE_URL
        self.supabase_key = SUPABASE_KEY
        self.connection = None

    def connect(self) -> bool:
        """
        Nawiązuje połączenie z bazą Supabase.
        """
        try:
            # Parsuj Supabase URL: https://xxxx.supabase.co
            # Domyślnie Supabase udostępnia pg_connection_string w Secret Management
            # Dla prostoty używamy psycopg2 bezpośrednio
            host = self.supabase_url.replace("https://", "").replace(".supabase.co", "")

            self.connection = psycopg2.connect(
                host=f"{host}.supabase.co",
                user="postgres",
                password=self.supabase_key,
                database="postgres",
                port=5432
            )
            logger.info("✓ Połączono z Supabase")
            return True
        except Exception as e:
            logger.error(f"✗ Błąd połączenia z Supabase: {e}")
            return False

    def close(self):
        """Zamyka połączenie."""
        if self.connection:
            self.connection.close()
            logger.info("Połączenie zamknięte")

    def insert_weather_records(self, records: List[Dict]) -> Tuple[int, int]:
        """
        Wstawia lub aktualizuje rekordy pogodowe w tabeli weather_data.

        Używa UPSERT (ON CONFLICT DO UPDATE) aby uniknąć duplikatów.

        Args:
            records: Lista słowników z danymi pogodowymi

        Returns:
            (inserted_count, updated_count)
        """
        if not self.connection:
            logger.error("Brak połączenia z bazą")
            return 0, 0

        inserted = 0
        updated = 0

        try:
            cursor = self.connection.cursor()

            # Przygotuj INSERT ... ON CONFLICT DO UPDATE
            columns = [
                "latitude", "longitude", "location_name", "forecast_time",
                "data_source", "temperature_2m", "u_wind_10m", "v_wind_10m",
                "wind_speed_10m", "wind_direction_10m", "precipitation_6h",
                "cloud_cover_total"
            ]

            # Stwórz liste wartości
            values = []
            for record in records:
                values.append((
                    record.get("latitude"),
                    record.get("longitude"),
                    record.get("location_name"),
                    record.get("forecast_time"),
                    record.get("data_source"),
                    record.get("temperature_2m"),
                    record.get("u_wind_10m"),
                    record.get("v_wind_10m"),
                    record.get("wind_speed_10m"),
                    record.get("wind_direction_10m"),
                    record.get("precipitation_6h"),
                    record.get("cloud_cover_total"),
                ))

            # UPSERT query
            insert_query = f"""
            INSERT INTO {SUPABASE_TABLE_WEATHER} ({", ".join(columns)})
            VALUES %s
            ON CONFLICT (latitude, longitude, forecast_time)
            DO UPDATE SET
                temperature_2m = EXCLUDED.temperature_2m,
                u_wind_10m = EXCLUDED.u_wind_10m,
                v_wind_10m = EXCLUDED.v_wind_10m,
                wind_speed_10m = EXCLUDED.wind_speed_10m,
                wind_direction_10m = EXCLUDED.wind_direction_10m,
                precipitation_6h = EXCLUDED.precipitation_6h,
                cloud_cover_total = EXCLUDED.cloud_cover_total,
                updated_at = CURRENT_TIMESTAMP
            RETURNING id;
            """

            # Wykonaj INSERT
            execute_values(cursor, insert_query, values, page_size=100)
            rows_affected = cursor.rowcount

            self.connection.commit()
            logger.info(f"✓ Wstawiono/zaktualizowano {rows_affected} rekordów w weather_data")

            return rows_affected, 0

        except Exception as e:
            logger.error(f"✗ Błąd przy insercie: {e}")
            self.connection.rollback()
            return 0, 0
        finally:
            cursor.close()

    def insert_daily_stats(self, stats: List[Dict]) -> int:
        """
        Wstawia statystyki dzienne do tabeli daily_stats.

        Args:
            stats: Lista słowników ze statystykami dziennymi

        Returns:
            Liczba wstawionych rekordów
        """
        if not self.connection:
            logger.error("Brak połączenia z bazą")
            return 0

        try:
            cursor = self.connection.cursor()

            columns = [
                "date", "latitude", "longitude", "location_name",
                "temp_min", "temp_max", "temp_avg",
                "wind_speed_avg", "wind_speed_max", "wind_direction_dominant",
                "precipitation_sum", "cloud_cover_avg"
            ]

            values = []
            for stat in stats:
                values.append((
                    stat.get("date"),
                    stat.get("latitude"),
                    stat.get("longitude"),
                    stat.get("location_name"),
                    stat.get("temp_min"),
                    stat.get("temp_max"),
                    stat.get("temp_avg"),
                    stat.get("wind_speed_avg"),
                    stat.get("wind_speed_max"),
                    stat.get("wind_direction_dominant"),
                    stat.get("precipitation_sum"),
                    stat.get("cloud_cover_avg"),
                ))

            insert_query = f"""
            INSERT INTO {SUPABASE_TABLE_DAILY_STATS} ({", ".join(columns)})
            VALUES %s
            ON CONFLICT (date, latitude, longitude)
            DO UPDATE SET
                temp_min = EXCLUDED.temp_min,
                temp_max = EXCLUDED.temp_max,
                temp_avg = EXCLUDED.temp_avg,
                wind_speed_avg = EXCLUDED.wind_speed_avg,
                wind_speed_max = EXCLUDED.wind_speed_max,
                wind_direction_dominant = EXCLUDED.wind_direction_dominant,
                precipitation_sum = EXCLUDED.precipitation_sum,
                cloud_cover_avg = EXCLUDED.cloud_cover_avg,
                updated_at = CURRENT_TIMESTAMP;
            """

            execute_values(cursor, insert_query, values, page_size=100)
            rows_affected = cursor.rowcount

            self.connection.commit()
            logger.info(f"✓ Wstawiono {rows_affected} statystyk dziennych")

            return rows_affected

        except Exception as e:
            logger.error(f"✗ Błąd przy insercie daily_stats: {e}")
            self.connection.rollback()
            return 0
        finally:
            cursor.close()

    def log_sync(self, status: str, records_fetched: int, records_inserted: int,
                 records_updated: int, error_msg: str = None, execution_time: float = 0.0):
        """
        Zapisuje log synchronizacji do tabeli sync_logs.
        """
        if not self.connection:
            return

        try:
            cursor = self.connection.cursor()

            insert_query = f"""
            INSERT INTO {SUPABASE_TABLE_SYNC_LOGS}
            (sync_timestamp, status, records_fetched, records_inserted, records_updated, error_message, execution_time_seconds)
            VALUES (%s, %s, %s, %s, %s, %s, %s);
            """

            cursor.execute(insert_query, (
                datetime.utcnow(),
                status,
                records_fetched,
                records_inserted,
                records_updated,
                error_msg,
                execution_time
            ))

            self.connection.commit()
            logger.info("✓ Log synchronizacji zapisany")

        except Exception as e:
            logger.error(f"✗ Błąd przy logu: {e}")
            self.connection.rollback()
        finally:
            cursor.close()
