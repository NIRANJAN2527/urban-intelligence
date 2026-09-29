import os
import sys

# Ensure edge_ai directory is in path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

from video_sync_processor import process_uploaded_video

VIDEO_PATH = os.path.abspath(os.path.join(CURRENT_DIR, "..", "data", "cityRoad_potHoles-side.mp4"))
GPS_PATH = os.path.abspath(os.path.join(CURRENT_DIR, "..", "sample_data", "pothole_test_01.csv"))

print(f"Running DrishtiYana Pipeline Verification:")
print(f"Video: {VIDEO_PATH}")
print(f"GPS:   {GPS_PATH}")

result = process_uploaded_video(
    video_path=VIDEO_PATH,
    gps_source=GPS_PATH,
    session_id="SESSION-VERIFY-SIDE",
    bus_id="BUS-101",
    camera_id="CAM-01",
    video_source="cityRoad_potHoles-side.mp4",
    node_backend_url="http://127.0.0.1:3000",
    dispatch_to_server=True,
    frame_step=5  # Fast step for diagnostic run
)

print("\nPipeline Run Completed!")
print(f"Processed frames: {result.get('processed_frames')}")
print(f"Finalized events: {len(result.get('finalized_events', []))}")
