"""
DRISHTIYANA - Automated Edge AI Pipeline Test Suite
Tests:
1. YOLOv8 Model Loading from specified path
2. OpenCV Image Enhancement Pipeline
3. Confidence Thresholding (>= 0.80)
4. Redis Best-Detection Window & 30s TTL
5. GPS Nearest-Neighbor Correlation & Tolerance Limit
"""

import sys
import os
import time
import numpy as np
import cv2

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from enhancement import enhance_frame, correct_brightness, apply_clahe, sharpen_frame
from detector import PotholeDetector, POTHOLE_CONFIDENCE_THRESHOLD, DEFAULT_MODEL_PATH
from redis_tracker import RedisBestDetectionTracker
from gps_matcher import get_gps_for_video_timestamp, parse_timestamp_to_ms


def test_model_and_enhancement():
    print("\n[Test 1] Testing Model Loading & Image Enhancement Pipeline...")
    assert os.path.exists(DEFAULT_MODEL_PATH), f"Model file must exist at {DEFAULT_MODEL_PATH}"
    detector = PotholeDetector()
    assert detector.model is not None, "YOLO model failed to load"
    assert "Pothole" in detector.model.names.values() or 0 in detector.model.names, "Pothole class missing from model"
    print(f"   Model verified: {detector.model.names}")

    # Create dummy road test image (720x1280 BGR)
    test_img = np.full((720, 1280, 3), 70, dtype=np.uint8)
    # Add a simulated dark pothole oval
    cv2.ellipse(test_img, (640, 480), (120, 60), 0, 0, 360, (20, 20, 20), -1)

    # Test individual enhancements
    bright = correct_brightness(test_img)
    assert bright.shape == test_img.shape
    clahe_out = apply_clahe(bright)
    assert clahe_out.shape == test_img.shape
    sharp = sharpen_frame(clahe_out)
    assert sharp.shape == test_img.shape

    full_enhanced = enhance_frame(test_img)
    assert full_enhanced.shape == test_img.shape
    print("   OpenCV Enhancement Pipeline: PASS")

    # Run detector
    detections, annotated = detector.detect(full_enhanced)
    assert annotated.shape == test_img.shape
    for d in detections:
        assert d["confidence"] >= POTHOLE_CONFIDENCE_THRESHOLD, "Detection below 0.80 threshold leaked!"
    print(f"   YOLO Inference & Filtering (threshold {POTHOLE_CONFIDENCE_THRESHOLD}): PASS")


def test_redis_best_detection_tracking():
    print("\n[Test 2] Testing Redis Best-Detection Tracking & 30s TTL...")
    tracker = RedisBestDetectionTracker()
    session_id = "SESSION-TEST-AI"
    cluster_key = "cluster_100"

    # Candidate 1: confidence 0.82
    cand1 = {
        "session_id": session_id,
        "frame_id": 100,
        "confidence": 0.82,
        "bbox": {"x1": 300, "y1": 200, "x2": 450, "y2": 320}
    }
    is_best, rec, conf = tracker.update_best_detection(session_id, cluster_key, cand1, ttl_seconds=30)
    assert is_best is True
    assert conf == 0.82
    print("   Candidate 1 (0.82) accepted as new best: PASS")

    # Candidate 2: confidence 0.87 (higher -> should update)
    cand2 = {
        "session_id": session_id,
        "frame_id": 101,
        "confidence": 0.87,
        "bbox": {"x1": 310, "y1": 205, "x2": 460, "y2": 325}
    }
    is_best, rec, conf = tracker.update_best_detection(session_id, cluster_key, cand2, ttl_seconds=30)
    assert is_best is True
    assert conf == 0.87
    print("   Candidate 2 (0.87) updated Redis: PASS")

    # Candidate 3: confidence 0.84 (lower -> should NOT update)
    cand3 = {
        "session_id": session_id,
        "frame_id": 102,
        "confidence": 0.84,
        "bbox": {"x1": 315, "y1": 210, "x2": 465, "y2": 330}
    }
    is_best, rec, conf = tracker.update_best_detection(session_id, cluster_key, cand3, ttl_seconds=30)
    assert is_best is False
    assert conf == 0.87, "Redis did not retain higher candidate!"
    print("   Candidate 3 (0.84) rejected, kept 0.87: PASS")

    # Candidate 4: confidence 0.95 (higher -> should update)
    cand4 = {
        "session_id": session_id,
        "frame_id": 103,
        "confidence": 0.95,
        "bbox": {"x1": 320, "y1": 210, "x2": 470, "y2": 335}
    }
    is_best, rec, conf = tracker.update_best_detection(session_id, cluster_key, cand4, ttl_seconds=30)
    assert is_best is True
    assert conf == 0.95
    print("   Candidate 4 (0.95) updated Redis: PASS")

    # Verify TTL
    if tracker.client:
        ttl = tracker.client.ttl(f"pothole:{session_id}:{cluster_key}")
        assert 0 < ttl <= 30, f"Expected TTL <= 30, got {ttl}"
        print(f"   Redis TTL active: {ttl}s (30s window verified)")


def test_gps_timestamp_correlation():
    print("\n[Test 3] Testing GPS and Video Timestamp Correlation...")
    gps_records = [
        {"gps_timestamp": "2026-09-08T10:32:14.000Z", "latitude": 17.385000, "longitude": 78.486600, "accuracy": 4.5},
        {"gps_timestamp": "2026-09-08T10:32:15.000Z", "latitude": 17.385120, "longitude": 78.486720, "accuracy": 4.2},
        {"gps_timestamp": "2026-09-08T10:32:16.000Z", "latitude": 17.385240, "longitude": 78.486850, "accuracy": 4.0}
    ]

    # Target frame video timestamp: 10:32:15.300
    target_time_ms = parse_timestamp_to_ms("2026-09-08T10:32:15.300Z")
    match = get_gps_for_video_timestamp(target_time_ms, gps_records, max_difference_ms=2000)

    assert match["gps_match_status"] == "GPS MATCHED"
    assert match["latitude"] == 17.385120
    assert match["timestamp_difference_ms"] == 300
    print(f"   Target 10:32:15.300 matched to 10:32:15.000 (delta: {match['timestamp_difference_ms']} ms): PASS")

    # Target frame video timestamp far away: 10:32:25.000 (> 2000 ms away)
    far_time_ms = parse_timestamp_to_ms("2026-09-08T10:32:25.000Z")
    far_match = get_gps_for_video_timestamp(far_time_ms, gps_records, max_difference_ms=2000)
    assert far_match["gps_match_status"] == "NO_CLOSE_MATCH"
    assert far_match["timestamp_difference_ms"] > 2000
    print(f"   Far Target 10:32:25.000 marked as NO_CLOSE_MATCH (delta: {far_match['timestamp_difference_ms']} ms): PASS")


if __name__ == "__main__":
    print("=======================================================")
    print("   DRISHTIYANA - Automated Edge AI Pipeline Tests    ")
    print("=======================================================")
    test_model_and_enhancement()
    test_redis_best_detection_tracking()
    test_gps_timestamp_correlation()
    print("\n🎉 ALL EDGE AI PIPELINE TESTS PASSED SUCCESSFULLY!\n")
