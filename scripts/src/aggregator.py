"""
Agregator danych: oblicza statystyki dzienne ze zwykłych obserwacji.
"""
import logging
from datetime import datetime, timedelta
from typing import List, Dict
from collections import defaultdict
import statistics
import math

logger = logging.getLogger(__name__)


class DataAggregator:
    """Agreguje dane surowe do statystyk dziennych."""

    @staticmethod
    def aggregate_daily_stats(records: List[Dict]) -> List[Dict]:
        """
        Agreguje rekordy surowe do statystyk dziennych.

        Grupuje po (dniu, lokalizacji) i oblicza min/max/średnie.

        Args:
            records: Lista rekordów surowych z weather_data

        Returns:
            Lista statystyk dziennych
        """
        grouped = defaultdict(list)

        # Grupuj po (data, lat, lon)
        for record in records:
            try:
                time_obj = datetime.fromisoformat(record["forecast_time"].replace("Z", "+00:00"))
                date_key = time_obj.date()

                group_key = (
                    str(date_key),
                    round(record["latitude"], 4),
                    round(record["longitude"], 4),
                    record.get("location_name", "Unknown")
                )

                grouped[group_key].append(record)
            except Exception as e:
                logger.warning(f"Błąd przy grupowaniu rekordu: {e}")
                continue

        stats = []

        # Oblicz statystyki dla każdej grupy
        for (date_str, lat, lon, location_name), group_records in grouped.items():
            try:
                temps = [r["temperature_2m"] for r in group_records if r.get("temperature_2m")]
                wind_speeds = [r["wind_speed_10m"] for r in group_records if r.get("wind_speed_10m")]
                wind_dirs = [r["wind_direction_10m"] for r in group_records if r.get("wind_direction_10m")]
                wind_gusts = [r["wind_gust_10m"] for r in group_records if r.get("wind_gust_10m")]
                precips = [r["precipitation_6h"] for r in group_records if r.get("precipitation_6h")]
                snowfalls = [r["snowfall_6h"] for r in group_records if r.get("snowfall_6h")]
                clouds = [r["cloud_cover_total"] for r in group_records if r.get("cloud_cover_total")]
                pressures = [r["pressure_msl"] for r in group_records if r.get("pressure_msl")]
                dewpoints = [r["dewpoint_temperature_2m"] for r in group_records if r.get("dewpoint_temperature_2m")]
                humidities = [r["relative_humidity_2m"] for r in group_records if r.get("relative_humidity_2m")]
                sea_temps = [r["sea_surface_temperature"] for r in group_records if r.get("sea_surface_temperature")]

                stat = {
                    "date": date_str,
                    "latitude": lat,
                    "longitude": lon,
                    "location_name": location_name,
                    "temp_min": min(temps) if temps else None,
                    "temp_max": max(temps) if temps else None,
                    "temp_avg": statistics.mean(temps) if temps else None,
                    "wind_speed_avg": statistics.mean(wind_speeds) if wind_speeds else None,
                    "wind_speed_max": max(wind_speeds) if wind_speeds else None,
                    "wind_gust_max": max(wind_gusts) if wind_gusts else None,
                    "wind_direction_dominant": DataAggregator._mean_circular(wind_dirs) if wind_dirs else None,
                    "precipitation_sum": sum(precips) if precips else None,
                    "snowfall_sum": sum(snowfalls) if snowfalls else None,
                    "cloud_cover_avg": statistics.mean(clouds) if clouds else None,
                    "pressure_msl_min": min(pressures) if pressures else None,
                    "pressure_msl_max": max(pressures) if pressures else None,
                    "pressure_msl_avg": statistics.mean(pressures) if pressures else None,
                    "dewpoint_2m_min": min(dewpoints) if dewpoints else None,
                    "dewpoint_2m_max": max(dewpoints) if dewpoints else None,
                    "dewpoint_2m_avg": statistics.mean(dewpoints) if dewpoints else None,
                    "humidity_2m_min": min(humidities) if humidities else None,
                    "humidity_2m_max": max(humidities) if humidities else None,
                    "humidity_2m_avg": statistics.mean(humidities) if humidities else None,
                    "sea_surface_temp_min": min(sea_temps) if sea_temps else None,
                    "sea_surface_temp_max": max(sea_temps) if sea_temps else None,
                    "sea_surface_temp_avg": statistics.mean(sea_temps) if sea_temps else None,
                }

                stats.append(stat)
            except Exception as e:
                logger.warning(f"Błąd przy agregacji statystyk dla {location_name}: {e}")
                continue

        logger.info(f"✓ Wyliczono statystyki dla {len(stats)} dniówek lokalizacji")
        return stats

    @staticmethod
    def _mean_circular(angles: List[float]) -> float:
        """
        Oblicza średni kierunek wiatru (statystyka kierunkowa).

        Kierunki to kąty, więc 359° i 1° powinny dać ~0°, a nie 180°.

        Args:
            angles: Lista kierunków w stopniach (0-360)

        Returns:
            Średni kierunek w stopniach
        """
        if not angles:
            return None

        # Konwersja do radianów i obliczenie składowych
        radians = [math.radians(a) for a in angles]
        sin_sum = sum(math.sin(r) for r in radians)
        cos_sum = sum(math.cos(r) for r in radians)

        # Średni kąt
        mean_rad = math.atan2(sin_sum, cos_sum)
        mean_deg = math.degrees(mean_rad)

        # Normalizuj do 0-360
        return (mean_deg + 360) % 360
