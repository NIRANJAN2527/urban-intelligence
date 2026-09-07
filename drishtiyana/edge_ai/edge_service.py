"""
DRISHTIYANA - Edge AI Processing Service
FastAPI microservice executing OpenCV enhancement, YOLOv8 pothole inference,
Redis best-detection caching (30s TTL), and GPS timestamp correlation.
Runs on http://127.0.0.1:5001 alongside the Node.js backend.
"""

import base64
import json
import os
import time
from typing import Optional
import cv2
import numpy as np
import requests
from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from enhancement import enhance_frame
from detector import PotholeDetector, POTHOLE_CONFIDENCE_THRESHOLD, DEFAULT_MODEL_PATH
from redis_tracker import RedisBestDetectionTracker
from gps_matcher import get_gps_for_video_timestamp, parse_timestamp_to_ms

# Node.js backend endpoint for submitting verified evidence events
NODE_BACKEND_URL = os.environ.get("NODE_BACKEND_URL", "http://127.0.0.1:3000")

from contextlib import asynccontextmanager

# Global singleton instances
detector: Optional[PotholeDetector] = None
redis_tracker: Optional[RedisBestDetectionTracker] = None

# Metrics state
session_metrics = {
    "total_frames_processed": 0,
    "total_detections_found": 0,
    "total_accepted_events": 0,
    "highest_confidence_seen": 0.0,
    "last_inference_ms": 0.0,
    "active_session_id": None
}

@asynccontextmanager
async def lifespan(app: FastAPI):
    global detector, redis_tracker
    print("\n=======================================================")
    print("   DRISHTIYANA - Starting Edge AI Processing Service   ")
    print("=======================================================")

    # 1. Initialize YOLO detector once
    try:
        detector = PotholeDetector()
    except Exception as e:
        print(f"[Startup ERROR] Failed to load YOLO detector: {e}")
        detector = None

    # 2. Initialize Redis Best Detection Tracker
    try:
        redis_tracker = RedisBestDetectionTracker()
    except Exception as e:
        print(f"[Startup ERROR] Failed to initialize Redis tracker: {e}")
        redis_tracker = None

    print("[Startup] Edge AI Service is READY on port 5001!\n")
    yield

app = FastAPI(title="DRISHTIYANA Edge AI Service", version="1.0.0", lifespan=lifespan)

# Enable CORS for browser access from http://localhost:3000
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/edge/health")
def health_check():
    return {
        "status": "HEALTHY",
        "service": "DRISHTIYANA Edge AI",
        "model_loaded": detector is not None and detector.model is not None,
        "model_path": detector.model_path if detector else DEFAULT_MODEL_PATH,
        "confidence_threshold": POTHOLE_CONFIDENCE_THRESHOLD,
        "redis_status": redis_tracker.get_redis_status() if redis_tracker else {"connected": False},
        "metrics": session_metrics
    }


@app.get("/api/edge/stats")
def get_stats():
    return session_metrics


@app.post("/api/edge/process-frame")
async def process_frame(
    frame: UploadFile = File(...),
    session_id: str = Form("DEFAULT-SESSION"),
    bus_id: str = Form("BUS-101"),
    camera_id: str = Form("CAM-01"),
    frame_id: int = Form(1),
    video_timestamp: str = Form(...),
    gps_records: Optional[str] = Form(None)
):
    """
    Main Edge AI Pipeline Endpoint:
    1. Reads & decodes JPEG frame into OpenCV array.
    2. Runs OpenCV enhancement pipeline (brightness correction, CLAHE, sharpening).
    3. Runs YOLO pothole inference on enhanced frame.
    4. Filters detections (confidence >= 0.80).
    5. Updates Redis best-score cache per cluster key (TTL 30s).
    6. Correlates video timestamp to nearest GPS record.
    7. Dispatches evidence event to Node.js backend if a new best score is achieved.
    8. Returns processing statistics, detection metadata, and annotated frame preview.
    """
    if detector is None or detector.model is None:
        raise HTTPException(status_code=503, detail="YOLO detector is not initialized or model file missing.")

    t_start = time.time()

    # Step 1: Decode Frame
    contents = await frame.read()
    nparr = np.frombuffer(contents, np.uint8)
    img_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img_bgr is None:
        raise HTTPException(status_code=400, detail="Failed to decode input frame into valid image.")

    # Step 2: Image Enhancement Pipeline
    enhanced_frame = enhance_frame(img_bgr)

    # Step 3: YOLO Inference & Confidence Filtering (>= 0.80)
    accepted_detections, annotated_frame = detector.detect(enhanced_frame)

    t_inference = (time.time() - t_start) * 1000.0

    # Parse GPS records if passed
    parsed_gps_records = []
    if gps_records:
        try:
            parsed_gps_records = json.loads(gps_records)
        except Exception:
            parsed_gps_records = []

    # Parse video timestamp in ms
    video_ts_ms = parse_timestamp_to_ms(video_timestamp) or int(time.time() * 1000)

    # Correlate GPS to detected frame's video timestamp
    gps_match = get_gps_for_video_timestamp(video_ts_ms, parsed_gps_records)

    # Update session metrics
    session_metrics["total_frames_processed"] += 1
    session_metrics["last_inference_ms"] = round(t_inference, 1)
    session_metrics["active_session_id"] = session_id

    latest_event = None
    annotated_base64 = None

    if len(accepted_detections) > 0:
        session_metrics["total_detections_found"] += len(accepted_detections)

        # Select highest confidence detection in this frame
        best_in_frame = max(accepted_detections, key=lambda d: d["confidence"])
        conf = best_in_frame["confidence"]

        if conf > session_metrics["highest_confidence_seen"]:
            session_metrics["highest_confidence_seen"] = conf

        # Step 5: Redis Best-Detection Window (30s TTL)
        cluster_key = redis_tracker.compute_cluster_key(video_ts_ms) if redis_tracker else "cluster_default"

        event_payload = {
            "event_type": "POTHOLE",
            "event_id": f"EVT-{session_id}-{frame_id}",
            "session_id": session_id,
            "bus_id": bus_id,
            "camera_id": camera_id,
            "frame_id": frame_id,
            "video_timestamp": video_timestamp,
            "processing_timestamp": time.strftime("%Y-%m-%dT%H:%M:%S.", time.gmtime()) + f"{int((time.time() % 1) * 1000):03d}Z",
            "confidence": conf,
            "confidence_percent": best_in_frame["confidence_percent"],
            "class_name": best_in_frame["class_name"],
            "bbox": best_in_frame["bbox"],
            "gps": gps_match
        }

        is_new_best = True
        if redis_tracker:
            is_new_best, stored_record, best_conf = redis_tracker.update_best_detection(
                session_id=session_id,
                cluster_key=cluster_key,
                candidate_data=event_payload,
                ttl_seconds=30
            )

        if is_new_best:
            session_metrics["total_accepted_events"] += 1
            latest_event = event_payload

            # Step 7: Encode annotated evidence frame as JPEG and forward to Node.js backend
            _, buf = cv2.imencode(".jpg", annotated_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
            evidence_bytes = buf.tobytes()

            # Asynchronously send event to Node.js backend
            try:
                files = {"evidence_image": ("evidence.jpg", evidence_bytes, "image/jpeg")}
                data = {
                    "event_id": event_payload["event_id"],
                    "event_type": "POTHOLE",
                    "session_id": session_id,
                    "bus_id": bus_id,
                    "camera_id": camera_id,
                    "frame_id": str(frame_id),
                    "video_timestamp": video_timestamp,
                    "processing_timestamp": event_payload["processing_timestamp"],
                    "confidence": str(conf),
                    "class_name": best_in_frame["class_name"],
                    "bbox_x1": str(best_in_frame["bbox"]["x1"]),
                    "bbox_y1": str(best_in_frame["bbox"]["y1"]),
                    "bbox_x2": str(best_in_frame["bbox"]["x2"]),
                    "bbox_y2": str(best_in_frame["bbox"]["y2"]),
                    "latitude": str(gps_match["latitude"]) if gps_match["latitude"] is not None else "",
                    "longitude": str(gps_match["longitude"]) if gps_match["longitude"] is not None else "",
                    "gps_timestamp": str(gps_match["gps_timestamp"]) if gps_match["gps_timestamp"] else "",
                    "gps_accuracy": str(gps_match["accuracy"]) if gps_match["accuracy"] is not None else "",
                    "timestamp_difference_ms": str(gps_match["timestamp_difference_ms"]) if gps_match["timestamp_difference_ms"] is not None else "",
                    "gps_match_status": gps_match["gps_match_status"]
                }
                resp = requests.post(f"{NODE_BACKEND_URL}/api/edge/events", data=data, files=files, timeout=2.0)
                if resp.status_code == 200:
                    latest_event["server_status"] = "SENT TO SERVER"
                else:
                    latest_event["server_status"] = f"SERVER RESP {resp.status_code}"
            except Exception as dispatch_err:
                print(f"[Edge Service] Evidence submission notice (backend offline or pending): {dispatch_err}")
                latest_event["server_status"] = "LOCAL BUFFERED"

        # Encode annotated image preview for dashboard
        _, preview_buf = cv2.imencode(".jpg", annotated_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
        annotated_base64 = base64.b64encode(preview_buf).decode("utf-8")

    return {
        "processed": True,
        "frame_id": frame_id,
        "video_timestamp": video_timestamp,
        "processing_time_ms": round(t_inference, 1),
        "fps_achievable": round(1000.0 / max(t_inference, 1.0), 1),
        "detections_count": len(accepted_detections),
        "accepted_count": len(accepted_detections),
        "best_confidence": round(max([d["confidence"] for d in accepted_detections]), 4) if accepted_detections else 0.0,
        "gps": gps_match,
        "annotated_frame_base64": annotated_base64,
        "latest_event": latest_event
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=5001, log_level="info")
