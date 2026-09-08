"""
DRISHTIYANA - GPS and Video Timestamp Correlation Engine
Performs nearest-neighbor search between detected frame video timestamps
and mobile GPS telemetry records with configurable tolerance.
"""

from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

# Configurable tolerance: within 2 seconds (2000 ms)
GPS_MAX_TIME_DIFFERENCE_MS = 2000


def parse_timestamp_to_ms(ts) -> Optional[int]:
    """Converts ISO string, epoch float/int, or datetime to epoch milliseconds."""
    if ts is None:
        return None
    if isinstance(ts, (int, float)):
        # If seconds (e.g. 1788800000), convert to ms
        if ts < 10000000000:
            return int(ts * 1000)
        return int(ts)
    if isinstance(ts, datetime):
        return int(ts.timestamp() * 1000)
    if isinstance(ts, str):
        try:
            # Handle ISO string (e.g. 2026-09-08T10:32:15.300Z)
            clean_ts = ts.replace("Z", "+00:00")
            dt = datetime.fromisoformat(clean_ts)
            return int(dt.timestamp() * 1000)
        except Exception:
            # Try parsing integer from string
            try:
                return int(float(ts))
            except Exception:
                return None
    return None


def get_gps_for_video_timestamp(
    video_timestamp_ms: int,
    gps_records: List[Dict[str, Any]],
    max_difference_ms: int = GPS_MAX_TIME_DIFFERENCE_MS
) -> Dict[str, Any]:
    """
    Finds the recorded GPS point with the nearest timestamp to the detected video frame.
    
    Returns:
        {
            "latitude": float,
            "longitude": float,
            "gps_timestamp": str,
            "accuracy": float,
            "timestamp_difference_ms": int,
            "gps_match_status": "GPS MATCHED" | "NO_CLOSE_MATCH" | "NO_GPS_RECORDS"
        }
    """
    if not gps_records or len(gps_records) == 0:
        return {
            "latitude": None,
            "longitude": None,
            "gps_timestamp": None,
            "accuracy": None,
            "timestamp_difference_ms": None,
            "gps_match_status": "NO_GPS_RECORDS"
        }

    best_record = None
    min_diff_ms = float("inf")

    for rec in gps_records:
        rec_time_raw = rec.get("gps_timestamp") or rec.get("timestamp")
        rec_time_ms = parse_timestamp_to_ms(rec_time_raw)

        if rec_time_ms is None:
            continue

        diff_ms = abs(rec_time_ms - video_timestamp_ms)
        if diff_ms < min_diff_ms:
            min_diff_ms = diff_ms
            best_record = rec

    if best_record is None:
        return {
            "latitude": None,
            "longitude": None,
            "gps_timestamp": None,
            "accuracy": None,
            "timestamp_difference_ms": None,
            "gps_match_status": "NO_VALID_TIMESTAMPS"
        }

    is_within_tolerance = (min_diff_ms <= max_difference_ms)
    status = "GPS MATCHED" if is_within_tolerance else "NO_CLOSE_MATCH"

    if not is_within_tolerance:
        return {
            "latitude": None,
            "longitude": None,
            "gps_timestamp": None,
            "accuracy": None,
            "timestamp_difference_ms": int(min_diff_ms),
            "gps_match_status": status
        }

    try:
        latitude = float(best_record.get("latitude"))
        longitude = float(best_record.get("longitude"))
    except (TypeError, ValueError):
        return {
            "latitude": None,
            "longitude": None,
            "gps_timestamp": None,
            "accuracy": None,
            "timestamp_difference_ms": int(min_diff_ms),
            "gps_match_status": "GPS_UNAVAILABLE"
        }

    if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
        return {
            "latitude": None,
            "longitude": None,
            "gps_timestamp": None,
            "accuracy": None,
            "timestamp_difference_ms": int(min_diff_ms),
            "gps_match_status": "GPS_UNAVAILABLE"
        }

    return {
        "latitude": round(latitude, 6),
        "longitude": round(longitude, 6),
        "gps_timestamp": best_record.get("gps_timestamp") or best_record.get("timestamp"),
        "accuracy": round(float(best_record.get("accuracy", 0.0)), 1) if best_record.get("accuracy") is not None else None,
        "speed": round(float(best_record.get("speed", 0.0)), 2) if best_record.get("speed") is not None else None,
        "timestamp_difference_ms": int(min_diff_ms),
        "gps_match_status": status
    }
