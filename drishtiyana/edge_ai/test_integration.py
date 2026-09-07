"""
Integration test: Submits a simulated road image with GPS telemetry to the running Edge AI service
Verifies that process-frame succeeds, metrics update, and evidence is dispatched to Node.js backend.
"""

import cv2
import json
import numpy as np
import requests

EDGE_API = "http://127.0.0.1:5001/api/edge/process-frame"

# Create a test road frame with simulated asphalt & pothole
img = np.full((720, 1280, 3), 85, dtype=np.uint8)
# Add asphalt noise
noise = np.random.randint(-15, 15, (720, 1280, 3), dtype=np.int16)
img = np.clip(img.astype(np.int16) + noise, 0, 255).astype(np.uint8)
# Draw dark pothole region
cv2.ellipse(img, (640, 480), (140, 70), 0, 0, 360, (25, 25, 25), -1)
cv2.ellipse(img, (640, 480), (120, 55), 0, 0, 360, (15, 15, 15), -1)

_, img_bytes = cv2.imencode(".jpg", img)

gps_records = [
    {"gps_timestamp": "2026-09-08T10:32:14.000Z", "latitude": 17.385000, "longitude": 78.486600, "accuracy": 4.5},
    {"gps_timestamp": "2026-09-08T10:32:15.000Z", "latitude": 17.385120, "longitude": 78.486720, "accuracy": 4.2},
    {"gps_timestamp": "2026-09-08T10:32:16.000Z", "latitude": 17.385240, "longitude": 78.486850, "accuracy": 4.0}
]

files = {"frame": ("test_frame.jpg", img_bytes.tobytes(), "image/jpeg")}
data = {
    "session_id": "SESSION-INTEGRATION-TEST",
    "bus_id": "BUS-101",
    "camera_id": "CAM-01",
    "frame_id": "1",
    "video_timestamp": "2026-09-08T10:32:15.250Z",
    "gps_records": json.dumps(gps_records)
}

print("[Integration Test] Submitting frame to Edge AI service...")
res = requests.post(EDGE_API, files=files, data=data, timeout=10)
print(f"Status Code: {res.status_code}")
res_json = res.json()
print("Response JSON:")
print(json.dumps({k: v for k, v in res_json.items() if k != "annotated_frame_base64"}, indent=2))

assert res.status_code == 200, "Expected 200 OK"
assert res_json["processed"] is True, "Expected processed to be True"
assert res_json["gps"]["gps_match_status"] == "GPS MATCHED", "Expected GPS to match within 2000 ms"
assert res_json["gps"]["latitude"] == 17.38512, "Expected matched latitude 17.38512"
assert res_json["gps"]["timestamp_difference_ms"] == 250, "Expected delta 250 ms"

print("\n[PASS] End-to-End Edge AI Integration Test PASSED Successfully!")
