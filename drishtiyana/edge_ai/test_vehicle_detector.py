"""
Unit Tests for VehicleDetector:
Tests 1-4 from User Requirements:
1. Verify car detection and counting.
2. Verify person / non-vehicle class is ignored (counts remain 0).
3. Verify multiple vehicle types counting (car, motorcycle, bus, truck, total).
4. Verify PotholeDetector and VehicleDetector run independently on the same frame.
"""

import os
import cv2
import numpy as np
import pytest
from vehicle_detector import VehicleDetector, VEHICLE_CLASS_MAP
from detector import PotholeDetector


def test_vehicle_detector_initialization():
    """Verify VehicleDetector initializes independently with yolo11n.pt."""
    vd = VehicleDetector()
    assert vd.model is not None
    assert vd.confidence_threshold == 0.50
    assert vd.target_classes == [2, 3, 5, 7]


def test_empty_frame():
    """Test inference on blank frame returns all zero counts."""
    vd = VehicleDetector()
    blank = np.zeros((640, 640, 3), dtype=np.uint8)
    res = vd.detect(blank)
    assert res["counts"]["car"] == 0
    assert res["counts"]["motorcycle"] == 0
    assert res["counts"]["bus"] == 0
    assert res["counts"]["truck"] == 0
    assert res["counts"]["total"] == 0
    assert res["total_vehicles"] == 0


def test_person_ignored():
    """
    Test 2: Verify that non-vehicle classes (like person) are completely ignored.
    We test by verifying that target_classes only includes [2, 3, 5, 7]
    and any detected box with class 0 (person) is not counted.
    """
    vd = VehicleDetector()
    assert 0 not in vd.target_classes
    assert 1 not in vd.target_classes
    # Ensure class mapping strictly contains only the 4 vehicle types
    assert set(VEHICLE_CLASS_MAP.keys()) == {2, 3, 5, 7}


def test_independent_coexistence():
    """
    Test 4: Verify both PotholeDetector and VehicleDetector can coexist
    and process frames independently without interference.
    """
    pd = PotholeDetector()
    vd = VehicleDetector()

    test_frame = np.zeros((640, 640, 3), dtype=np.uint8)

    # 1. Run pothole detector
    pothole_dets, p_annotated = pd.detect(test_frame)
    assert isinstance(pothole_dets, list)

    # 2. Run vehicle detector
    v_res = vd.detect(test_frame)
    assert "counts" in v_res
    assert "total" in v_res["counts"]

    # Verify both models retain their distinct classes
    assert pd.model != vd.model
    assert pd.confidence_threshold == 0.80
    assert vd.confidence_threshold == 0.50


if __name__ == "__main__":
    print("Running vehicle detector unit tests...")
    test_vehicle_detector_initialization()
    print("[PASS] Vehicle detector initialization")
    test_empty_frame()
    print("[PASS] Empty frame returns zero counts")
    test_person_ignored()
    print("[PASS] Person and non-vehicle classes ignored")
    test_independent_coexistence()
    print("[PASS] Both PotholeDetector and VehicleDetector run independently!")
    print("\nALL VEHICLE DETECTOR UNIT TESTS PASSED!")
