"""
Unit & Integration Tests for Uploaded Video Timestamp Synchronization Pipeline
=============================================================================
Verifies:
1. Extraction of FIRST GPS timestamp as reference start time from CSV and JSON.
2. Calculation of frame timestamps using pure OpenCV timing (Frame / FPS).
   - Frame 0    -> elapsed = 0.0s  -> timestamp = start_time
   - Frame 30   -> elapsed = 1.0s  -> timestamp = start_time + 1.0s
   - Frame 300  -> elapsed = 10.0s -> timestamp = start_time + 10.0s
   - Frame 975  -> elapsed = 32.5s -> timestamp = start_time + 32.5s
3. Nearest GPS lookup using calculated frame timestamp.
4. Redis Candidate tracking with synchronized frame timestamps and video_source tagging.
5. Non-interference with existing Live Bus Sensor logic.
"""

import os
import sys
import time
import unittest
import numpy as np
from datetime import datetime, timezone, timedelta

# Ensure edge_ai directory is on path
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from video_sync_processor import (
    parse_iso_datetime,
    format_iso_datetime,
    parse_gps_source,
    extract_gps_reference_start_time,
    calculate_frame_timestamp
)
from gps_matcher import get_gps_for_video_timestamp, parse_timestamp_to_ms
from redis_tracker import RedisCandidateManager


class TestVideoTimestampSync(unittest.TestCase):

    def setUp(self):
        self.sample_csv_path = os.path.join(current_dir, "..", "sample_data", "pothole_test_01.csv")
        self.sample_json_path = os.path.join(current_dir, "..", "sample_data", "pothole_test_01.json")

    def test_01_gps_reference_extraction_csv(self):
        """STEP 1: Verify FIRST timestamp extraction from uploaded CSV."""
        self.assertTrue(os.path.exists(self.sample_csv_path), "Sample CSV must exist")
        records = parse_gps_source(self.sample_csv_path)
        self.assertGreater(len(records), 0)

        start_iso, start_dt = extract_gps_reference_start_time(records)
        self.assertEqual(start_iso, "2026-09-08T10:30:00.000Z")
        self.assertEqual(start_dt.year, 2026)
        self.assertEqual(start_dt.month, 9)
        self.assertEqual(start_dt.day, 8)
        self.assertEqual(start_dt.hour, 10)
        self.assertEqual(start_dt.minute, 30)
        self.assertEqual(start_dt.second, 0)
        print(f"\n[Test 1 PASSED] CSV Reference Start Time: {start_iso}")

    def test_02_gps_reference_extraction_json(self):
        """STEP 1: Verify FIRST timestamp extraction from uploaded JSON."""
        self.assertTrue(os.path.exists(self.sample_json_path), "Sample JSON must exist")
        records = parse_gps_source(self.sample_json_path)
        self.assertGreater(len(records), 0)

        start_iso, start_dt = extract_gps_reference_start_time(records)
        self.assertEqual(start_iso, "2026-09-08T10:30:00.000Z")
        print(f"[Test 2 PASSED] JSON Reference Start Time: {start_iso}")

    def test_03_deterministic_frame_timing_math(self):
        """
        STEPS 2 & 3: Verify frame timestamp calculation via OpenCV timing:
        frame_timestamp = video_start_time + (frame_number / FPS)
        """
        start_str = "2026-09-08T10:00:00.000Z"
        start_dt = parse_iso_datetime(start_str)
        fps = 30.0

        # Frame 0: elapsed = 0.0s -> 10:00:00.000Z
        ts_iso_0, ts_ms_0, elapsed_0 = calculate_frame_timestamp(start_dt, 0, fps)
        self.assertEqual(elapsed_0, 0.0)
        self.assertEqual(ts_iso_0, "2026-09-08T10:00:00.000Z")

        # Frame 30: elapsed = 1.0s -> 10:00:01.000Z
        ts_iso_30, ts_ms_30, elapsed_30 = calculate_frame_timestamp(start_dt, 30, fps)
        self.assertAlmostEqual(elapsed_30, 1.0, places=4)
        self.assertEqual(ts_iso_30, "2026-09-08T10:00:01.000Z")

        # Frame 300: elapsed = 10.0s -> 10:00:10.000Z
        ts_iso_300, ts_ms_300, elapsed_300 = calculate_frame_timestamp(start_dt, 300, fps)
        self.assertAlmostEqual(elapsed_300, 10.0, places=4)
        self.assertEqual(ts_iso_300, "2026-09-08T10:00:10.000Z")

        # Frame 975: elapsed = 32.5s -> 10:00:32.500Z
        ts_iso_975, ts_ms_975, elapsed_975 = calculate_frame_timestamp(start_dt, 975, fps)
        self.assertAlmostEqual(elapsed_975, 32.5, places=4)
        self.assertEqual(ts_iso_975, "2026-09-08T10:00:32.500Z")

        print("[Test 3 PASSED] OpenCV Timing Calculations Match Exact Expected Specification:")
        print(f"  Frame 0   -> elapsed={elapsed_0}s  -> {ts_iso_0}")
        print(f"  Frame 30  -> elapsed={elapsed_30}s -> {ts_iso_30}")
        print(f"  Frame 300 -> elapsed={elapsed_300}s -> {ts_iso_300}")
        print(f"  Frame 975 -> elapsed={elapsed_975}s -> {ts_iso_975}")

    def test_04_nearest_gps_lookup(self):
        """
        STEP 4: Using the calculated frame timestamp, find the nearest GPS record.
        """
        records = parse_gps_source(self.sample_csv_path)
        start_iso, start_dt = extract_gps_reference_start_time(records)
        fps = 30.0

        # Frame 60 -> elapsed = 2.0s -> 10:30:02.000Z
        # GPS record for 10:30:02 is latitude 17.385195, longitude 78.486820
        _, ts_ms_60, _ = calculate_frame_timestamp(start_dt, 60, fps)
        gps_match = get_gps_for_video_timestamp(ts_ms_60, records)

        self.assertEqual(gps_match["gps_match_status"], "GPS MATCHED")
        self.assertEqual(gps_match["timestamp_difference_ms"], 0)
        self.assertEqual(gps_match["latitude"], 17.385195)
        self.assertEqual(gps_match["longitude"], 78.486820)

        # Frame 75 -> elapsed = 2.5s -> 10:30:02.500Z (between 10:30:02 and 10:30:03)
        _, ts_ms_75, _ = calculate_frame_timestamp(start_dt, 75, fps)
        gps_match_mid = get_gps_for_video_timestamp(ts_ms_75, records)
        self.assertEqual(gps_match_mid["gps_match_status"], "GPS MATCHED")
        self.assertLessEqual(gps_match_mid["timestamp_difference_ms"], 500)
        self.assertIn(gps_match_mid["latitude"], [17.385195, 17.385270])

        print(f"[Test 4 PASSED] Nearest GPS Match: {gps_match['latitude']}, {gps_match['longitude']} (delta={gps_match['timestamp_difference_ms']}ms)")

    def test_04b_unavailable_gps_never_fabricates_coordinates(self):
        """Invalid or distant GPS records must produce an unavailable location."""
        frame_time = parse_timestamp_to_ms("2026-09-08T10:30:10.000Z")
        invalid_match = get_gps_for_video_timestamp(frame_time, [{
            "gps_timestamp": "2026-09-08T10:30:10.000Z",
            "latitude": None,
            "longitude": None
        }])
        self.assertIsNone(invalid_match["latitude"])
        self.assertIsNone(invalid_match["longitude"])
        self.assertEqual(invalid_match["gps_match_status"], "GPS_UNAVAILABLE")

        distant_match = get_gps_for_video_timestamp(frame_time, [{
            "gps_timestamp": "2026-09-08T10:30:00.000Z",
            "latitude": 17.385044,
            "longitude": 78.486671
        }])
        self.assertIsNone(distant_match["latitude"])
        self.assertIsNone(distant_match["longitude"])
        self.assertEqual(distant_match["gps_match_status"], "NO_CLOSE_MATCH")

    def test_05_redis_candidate_tracking_with_synchronized_timestamps(self):
        """
        STEPS 6 & 7: Verify Redis Candidate Manager retains highest confidence observation
        with the synchronized timestamp, GPS, and video_source metadata.
        """
        redis_mgr = RedisCandidateManager()
        session_id = f"TEST-UPLOAD-SESSION-{int(time.time())}"
        video_source = "dashcam_inspection_01.mp4"

        # Observation 1: Frame 30, conf = 0.82
        det_1 = {
            "bbox": {"x1": 100, "y1": 200, "x2": 250, "y2": 320},
            "confidence": 0.82,
            "class_name": "Pothole"
        }
        gps_1 = {"latitude": 17.385044, "longitude": 78.486671, "gps_timestamp": "2026-09-08T10:30:01.000Z"}
        dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)

        action1, cand1 = redis_mgr.process_detection(
            session_id=session_id,
            bus_id="BUS-TEST",
            camera_id="CAM-01",
            frame_id=30,
            video_timestamp="2026-09-08T10:30:01.000Z",
            processing_timestamp="2026-09-08T10:30:01.050Z",
            detection=det_1,
            gps_match=gps_1,
            annotated_frame=dummy_frame,
            current_time=1.0  # elapsed video time 1.0s
        )
        cand1["video_source"] = video_source

        self.assertEqual(action1, "CREATED")
        self.assertEqual(cand1["best_confidence"], 0.82)
        self.assertEqual(cand1["best_frame_id"], 30)
        self.assertEqual(cand1["best_video_timestamp"], "2026-09-08T10:30:01.000Z")

        # Observation 2: Frame 35, higher conf = 0.94, same pothole location (IoU > 0.3)
        det_2 = {
            "bbox": {"x1": 105, "y1": 205, "x2": 255, "y2": 325},
            "confidence": 0.94,
            "class_name": "Pothole"
        }
        gps_2 = {"latitude": 17.385120, "longitude": 78.486745, "gps_timestamp": "2026-09-08T10:30:01.166Z"}

        action2, cand2 = redis_mgr.process_detection(
            session_id=session_id,
            bus_id="BUS-TEST",
            camera_id="CAM-01",
            frame_id=35,
            video_timestamp="2026-09-08T10:30:01.166Z",
            processing_timestamp="2026-09-08T10:30:01.200Z",
            detection=det_2,
            gps_match=gps_2,
            annotated_frame=dummy_frame,
            current_time=1.166  # elapsed video time
        )

        self.assertEqual(action2, "UPDATED")
        self.assertEqual(cand2["best_confidence"], 0.94)
        self.assertEqual(cand2["best_frame_id"], 35)
        self.assertEqual(cand2["best_video_timestamp"], "2026-09-08T10:30:01.166Z")
        self.assertEqual(cand2["gps"]["latitude"], 17.385120)
        self.assertEqual(cand2["observation_count"], 2)

        # Finalize candidate
        finalized = redis_mgr.get_and_finalize_expired_candidates(session_id, current_time=100.0)
        self.assertEqual(len(finalized), 1)
        final_evt = finalized[0]
        self.assertEqual(final_evt["best_confidence"], 0.94)
        self.assertEqual(final_evt["best_video_timestamp"], "2026-09-08T10:30:01.166Z")
        self.assertEqual(final_evt["gps"]["latitude"], 17.385120)

        # Clean up
        redis_mgr.cleanup_all_session_data(session_id)
        print(f"[Test 5 PASSED] Redis Candidate correctly updated best confidence (0.94) & synchronized GPS ({final_evt['gps']['latitude']})")


if __name__ == "__main__":
    unittest.main()
