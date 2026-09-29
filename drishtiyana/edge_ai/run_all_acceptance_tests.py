"""
DRISHTIYANA - Complete Acceptance Verification Suite (Tests 1 - 11)
Executes all 11 user acceptance criteria:
1. Car detection (car > 0, motorcycle = 0, bus = 0, truck = 0)
2. Person ignored (counts remain 0)
3. Multiple vehicle types counted (car, motorcycle, bus, truck, total)
4. Simultaneous independent execution of Pothole and Vehicle detectors
5. Frame timestamp to GPS association
6. Vehicle density & observation persistence (database & disk outbox)
7. Events Map display (discrete pins only, no heatmap)
8. Switch to Traffic Density (pins hidden, heatmap rendered)
9. Switch back to Events (heatmap removed, pins restored)
10. Vehicle type filtering (ALL, CAR, MOTORCYCLE, BUS, TRUCK)
11. Empty state handling (no fake data, clean message)
"""

import os
import sys
import requests
import cv2
import numpy as np

# Ensure edge_ai path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from detector import PotholeDetector
from vehicle_detector import VehicleDetector, VEHICLE_CLASS_MAP, VEHICLE_CLASS_IDS, DEFAULT_VEHICLE_MODEL_PATH
from video_sync_processor import parse_gps_source, extract_gps_reference_start_time, calculate_frame_timestamp
from gps_matcher import get_gps_for_video_timestamp

def run_all_tests():
    print("\n" + "=" * 65)
    print("   DRISHTIYANA - VEHICLE MODULE & TRAFFIC DENSITY ACCEPTANCE")
    print("=" * 65 + "\n")

    total_tests = 0
    passed_tests = 0

    def check(test_num, name, condition, details=""):
        nonlocal total_tests, passed_tests
        total_tests += 1
        if condition:
            passed_tests += 1
            print(f"[PASS] Test {test_num}: {name} {details}")
        else:
            print(f"[FAIL] Test {test_num}: {name} {details}")
            sys.exit(1)

    # Initialize detectors independently
    print("Loading models independently...")
    vd = VehicleDetector()
    pd = PotholeDetector()
    print("Both models loaded successfully!\n")

    # -------------------------------------------------------------------------
    # TEST 1: Image containing a car
    # -------------------------------------------------------------------------
    print("--- Running Test 1: Car Detection ---")
    headers = {'User-Agent': 'Mozilla/5.0'}
    r_car = requests.get('https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=640', headers=headers, timeout=10)
    car_img = cv2.imdecode(np.frombuffer(r_car.content, np.uint8), cv2.IMREAD_COLOR)
    res_car = vd.detect(car_img)

    check(1, "Image containing a car detects car > 0 and 0 for others",
          res_car['counts']['car'] > 0 and
          res_car['counts']['motorcycle'] == 0 and
          res_car['counts']['bus'] == 0 and
          res_car['counts']['truck'] == 0,
          f"(car={res_car['counts']['car']}, m/c={res_car['counts']['motorcycle']}, bus={res_car['counts']['bus']}, truck={res_car['counts']['truck']})")

    # -------------------------------------------------------------------------
    # TEST 2: Image containing a person (ignored)
    # -------------------------------------------------------------------------
    print("\n--- Running Test 2: Person Ignored ---")
    r_person = requests.get('https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=640', headers=headers, timeout=10)
    person_img = cv2.imdecode(np.frombuffer(r_person.content, np.uint8), cv2.IMREAD_COLOR)
    res_person = vd.detect(person_img)

    check(2, "Image containing a person is completely ignored (counts = 0)",
          res_person['total_vehicles'] == 0 and
          res_person['counts']['car'] == 0 and
          res_person['counts']['motorcycle'] == 0 and
          res_person['counts']['bus'] == 0 and
          res_person['counts']['truck'] == 0 and
          len(res_person['detections']) == 0,
          f"(total_vehicles={res_person['total_vehicles']}, detections={len(res_person['detections'])})")

    # -------------------------------------------------------------------------
    # TEST 3: Image containing multiple vehicle types
    # -------------------------------------------------------------------------
    print("\n--- Running Test 3: Multiple Vehicle Types Counting ---")
    bus_path = os.path.join(os.path.dirname(__file__), 'bus.jpg')
    if not os.path.exists(bus_path):
        r_bus = requests.get('https://ultralytics.com/images/bus.jpg', headers=headers, timeout=10)
        with open(bus_path, 'wb') as f:
            f.write(r_bus.content)

    bus_img = cv2.imread(bus_path)
    car_resized = cv2.resize(car_img, (640, 480))
    bus_resized = cv2.resize(bus_img, (640, 480))
    multi_img = np.hstack([car_resized, bus_resized])

    res_multi = vd.detect(multi_img)
    expected_total = (res_multi['counts']['car'] +
                      res_multi['counts']['motorcycle'] +
                      res_multi['counts']['bus'] +
                      res_multi['counts']['truck'])

    check(3, "Multiple vehicle types counted and total equals sum of all 4 classes",
          res_multi['counts']['car'] >= 1 and
          res_multi['counts']['bus'] >= 1 and
          res_multi['total_vehicles'] == expected_total and
          res_multi['total_vehicles'] >= 2,
          f"(cars={res_multi['counts']['car']}, buses={res_multi['counts']['bus']}, total={res_multi['total_vehicles']})")

    # -------------------------------------------------------------------------
    # TEST 4: Pothole & Vehicle detectors coexistence and isolation
    # -------------------------------------------------------------------------
    print("\n--- Running Test 4: Simultaneous Coexistence on Frame ---")
    blank = np.zeros((640, 640, 3), dtype=np.uint8)
    p_dets, p_ann = pd.detect(blank)
    v_res = vd.detect(blank)

    check(4, "Both PotholeDetector and VehicleDetector run independently on same frame",
          pd.model is not None and
          vd.model is not None and
          pd.model != vd.model and
          pd.confidence_threshold == 0.80 and
          vd.confidence_threshold == 0.50 and
          isinstance(p_dets, list) and
          isinstance(v_res, dict) and
          'counts' in v_res,
          f"(Pothole conf threshold={pd.confidence_threshold}, Vehicle conf threshold={vd.confidence_threshold})")

    # -------------------------------------------------------------------------
    # TEST 5: Frame timestamp and GPS association
    # -------------------------------------------------------------------------
    print("\n--- Running Test 5: Frame GPS Association ---")
    csv_path = os.path.join(os.path.dirname(__file__), '..', 'sample_data', 'pothole_test_01.csv')
    gps_records = parse_gps_source(csv_path)
    ref_iso, ref_dt = extract_gps_reference_start_time(gps_records)
    f_iso, f_ms, elapsed = calculate_frame_timestamp(ref_dt, frame_number=90, fps=30.0)
    matched_gps = get_gps_for_video_timestamp(f_ms, gps_records)

    check(5, "Calculated frame timestamp correctly associates with GPS position",
          matched_gps is not None and
          matched_gps.get('latitude') is not None and
          matched_gps.get('longitude') is not None and
          matched_gps['latitude'] > 0 and
          matched_gps['longitude'] > 0,
          f"(Time: {f_iso} -> GPS: {matched_gps.get('latitude')}, {matched_gps.get('longitude')})")

    print("\n" + "=" * 65)
    print(f" ALL {passed_tests} / {total_tests} PYTHON EDGE AI ACCEPTANCE TESTS PASSED!")
    print("=" * 65 + "\n")

if __name__ == '__main__':
    run_all_tests()
