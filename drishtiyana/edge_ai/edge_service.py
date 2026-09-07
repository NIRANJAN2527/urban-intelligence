"""
DRISHTIYANA - Edge AI Processing Service
FastAPI microservice executing:
1. OpenCV preprocessing enhancement.
2. Pretrained YOLOv8 pothole inference (confidence >= 0.80).
3. Redis temporary candidate aggregation across consecutive frames.
4. Retention of strongest observation (best confidence, frame, bbox, GPS).
5. Candidate finalization upon 2.0s observation gap.
6. Asynchronous non-blocking dispatch of ONLY finalized events to Node.js backend.
7. Resilient error handling and bounded retry queue on server/Redis issues.
Runs on http://127.0.0.1:5001.
"""

import base64
import json
import os
import queue
import threading
import time
from typing import Optional, Dict, Any, List
import cv2
import numpy as np
import requests
from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager

from enhancement import enhance_frame
from detector import PotholeDetector, POTHOLE_CONFIDENCE_THRESHOLD, DEFAULT_MODEL_PATH
from redis_tracker import RedisCandidateManager
from gps_matcher import get_gps_for_video_timestamp, parse_timestamp_to_ms

# Node.js backend endpoint for submitting finalized events
NODE_BACKEND_URL = os.environ.get("NODE_BACKEND_URL", "http://127.0.0.1:3000")

# Global singleton instances
detector: Optional[PotholeDetector] = None
redis_tracker: Optional[RedisCandidateManager] = None

# Asynchronous server dispatch queue & worker state
dispatch_queue: queue.Queue = queue.Queue(maxsize=100)
retry_buffer: List[Dict[str, Any]] = []
retry_lock = threading.Lock()
worker_running = True
server_connection_status = "CONNECTED"

# Metrics state
session_metrics = {
    "total_frames_processed": 0,
    "total_detections_found": 0,
    "total_accepted_detections": 0,
    "total_candidates_created": 0,
    "total_final_events_sent": 0,
    "highest_confidence_seen": 0.0,
    "last_inference_ms": 0.0,
    "active_session_id": "DEFAULT-SESSION",
    "server_status": "CONNECTED"
}


def async_server_dispatch_worker():
    """
    Background worker thread:
    Continuously dequeues finalized candidates and dispatches them asynchronously
    to the Node.js backend endpoint. Live video and YOLO inference loops are NEVER blocked.
    """
    global server_connection_status
    print("[Dispatcher] Async server dispatch worker started.")

    while worker_running:
        item = None
        # 1. Check retry buffer first
        with retry_lock:
            if len(retry_buffer) > 0:
                item = retry_buffer.pop(0)

        # 2. If no retry item, get from dispatch queue
        if item is None:
            try:
                item = dispatch_queue.get(timeout=0.5)
            except queue.Empty:
                continue

        candidate = item
        session_id = candidate.get("session_id", "UNKNOWN")
        cand_id = candidate.get("candidate_id", "CAND000")
        event_id = f"EVT-{session_id}-{cand_id}"

        # Prepare multipart payload
        evidence_path = candidate.get("best_frame_path")
        evidence_bytes = None
        if evidence_path and os.path.exists(evidence_path):
            try:
                with open(evidence_path, "rb") as f:
                    evidence_bytes = f.read()
            except Exception as fe:
                print(f"[Dispatcher Notice] Could not read evidence image: {fe}")

        gps = candidate.get("gps") or {}
        best_bbox = candidate.get("best_bbox") or {"x1": 0, "y1": 0, "x2": 0, "y2": 0}

        data = {
            "event_id": event_id,
            "event_type": "POTHOLE",
            "candidate_id": cand_id,
            "session_id": session_id,
            "bus_id": candidate.get("bus_id", "BUS-101"),
            "camera_id": candidate.get("camera_id", "CAM-01"),
            "frame_id": str(candidate.get("best_frame_id", 1)),
            "video_timestamp": candidate.get("best_video_timestamp", ""),
            "processing_timestamp": candidate.get("best_processing_timestamp", ""),
            "confidence": str(candidate.get("best_confidence", 0.0)),
            "class_name": candidate.get("class_name", "Pothole"),
            "bbox_x1": str(best_bbox.get("x1", 0)),
            "bbox_y1": str(best_bbox.get("y1", 0)),
            "bbox_x2": str(best_bbox.get("x2", 0)),
            "bbox_y2": str(best_bbox.get("y2", 0)),
            "observation_count": str(candidate.get("observation_count", 1)),
            "latitude": str(gps.get("latitude")) if gps.get("latitude") is not None else "",
            "longitude": str(gps.get("longitude")) if gps.get("longitude") is not None else "",
            "gps_timestamp": str(gps.get("gps_timestamp")) if gps.get("gps_timestamp") else "",
            "gps_accuracy": str(gps.get("accuracy")) if gps.get("accuracy") is not None else "",
            "timestamp_difference_ms": str(gps.get("timestamp_difference_ms")) if gps.get("timestamp_difference_ms") is not None else "",
            "gps_match_status": str(gps.get("gps_match_status", "UNCHECKED"))
        }

        files = None
        if evidence_bytes:
            files = {"evidence_image": ("evidence.jpg", evidence_bytes, "image/jpeg")}

        try:
            resp = requests.post(f"{NODE_BACKEND_URL}/api/edge/events", data=data, files=files, timeout=2.0)
            if resp.status_code in [200, 201]:
                server_connection_status = "CONNECTED"
                session_metrics["server_status"] = "CONNECTED"
                session_metrics["total_final_events_sent"] += 1
                print(f"[SERVER] Final event sent: {event_id} (confidence={float(data['confidence']):.2f}, observations={data['observation_count']})")
                print(f"[DB] Event saved: {event_id}")
            else:
                server_connection_status = "ERROR"
                session_metrics["server_status"] = "ERROR"
                print(f"[SERVER WARNING] Backend response {resp.status_code} for {event_id}")
        except Exception as dispatch_err:
            server_connection_status = "PENDING"
            session_metrics["server_status"] = "PENDING"
            print(f"[SERVER NOTICE] Server currently unreachable ({dispatch_err}). Buffering event {event_id} for retry.")
            with retry_lock:
                if len(retry_buffer) < 50:
                    retry_buffer.append(candidate)
            time.sleep(1.0)


def candidate_sweeper_worker():
    """
    Background worker thread:
    Periodically checks if any active candidates have exceeded the 2.0s gap
    without new observations and finalizes them promptly even if no new video frames arrive.
    """
    while worker_running:
        time.sleep(0.5)
        if redis_tracker and session_metrics.get("active_session_id"):
            session_id = session_metrics["active_session_id"]
            try:
                expired = redis_tracker.get_and_finalize_expired_candidates(session_id)
                for cand in expired:
                    try:
                        dispatch_queue.put_nowait(cand)
                    except queue.Full:
                        print(f"[Dispatcher Warning] Dispatch queue full, buffering event {cand['candidate_id']}")
                        with retry_lock:
                            if len(retry_buffer) < 50:
                                retry_buffer.append(cand)
            except Exception as sweeper_err:
                print(f"[Sweeper Error] {sweeper_err}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    global detector, redis_tracker, worker_running
    print("\n=======================================================")
    print("   DRISHTIYANA - Starting Edge AI Processing Service   ")
    print("=======================================================")

    # 1. Initialize YOLO detector
    try:
        detector = PotholeDetector()
    except Exception as e:
        print(f"[Startup ERROR] Failed to load YOLO detector: {e}")
        detector = None

    # 2. Initialize Redis Candidate Manager
    try:
        redis_tracker = RedisCandidateManager()
    except Exception as e:
        print(f"[Startup ERROR] Failed to initialize Redis candidate manager: {e}")
        redis_tracker = None

    # 3. Start background async dispatch and sweeper threads
    worker_running = True
    dispatch_thread = threading.Thread(target=async_server_dispatch_worker, daemon=True)
    dispatch_thread.start()

    sweeper_thread = threading.Thread(target=candidate_sweeper_worker, daemon=True)
    sweeper_thread.start()

    print("[Startup] Edge AI Service & Candidate Manager READY on port 5001!\n")
    yield
    worker_running = False


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
    active_count = 0
    if redis_tracker and session_metrics.get("active_session_id"):
        try:
            active_count = len(redis_tracker.get_active_candidates(session_metrics["active_session_id"]))
        except Exception:
            active_count = 0

    return {
        "status": "HEALTHY",
        "service": "DRISHTIYANA Edge AI Candidate Pipeline",
        "yolo_status": "ACTIVE" if detector is not None and detector.model is not None else "OFFLINE",
        "model_loaded": detector is not None and detector.model is not None,
        "model_path": detector.model_path if detector else DEFAULT_MODEL_PATH,
        "confidence_threshold": POTHOLE_CONFIDENCE_THRESHOLD,
        "redis_status": redis_tracker.get_redis_status() if redis_tracker else {"connected": False, "mode": "disconnected"},
        "active_candidates_count": active_count,
        "finalized_events_count": session_metrics["total_final_events_sent"],
        "server_status": server_connection_status,
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
    2. Runs OpenCV enhancement pipeline (brightness correction, CLAHE).
    3. Runs YOLO pothole inference on enhanced frame.
    4. Filters detections (confidence >= 0.80).
    5. Ingests detections into Redis Candidate Manager (IoU/center distance matching).
    6. Updates existing candidates or creates new candidates; retains highest confidence observation.
    7. Checks for unobserved candidates exceeding 2.0s gap and finalizes them.
    8. Dispatches finalized candidates asynchronously to server/database.
    9. Returns processing statistics, detection metadata, and preview for UI.
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

    # Correlate GPS to detected frame's video timestamp (bus observation location)
    gps_match = get_gps_for_video_timestamp(video_ts_ms, parsed_gps_records)

    # Update session metrics
    session_metrics["total_frames_processed"] += 1
    session_metrics["last_inference_ms"] = round(t_inference, 1)
    session_metrics["active_session_id"] = session_id

    processing_timestamp = time.strftime("%Y-%m-%dT%H:%M:%S.", time.gmtime()) + f"{int((time.time() % 1) * 1000):03d}Z"

    latest_candidate_info = None

    # Step 4: Redis Candidate Ingestion (Detections >= 0.80)
    if len(accepted_detections) > 0 and redis_tracker:
        session_metrics["total_detections_found"] += len(accepted_detections)
        session_metrics["total_accepted_detections"] += len(accepted_detections)

        for det in accepted_detections:
            conf = det["confidence"]
            if conf > session_metrics["highest_confidence_seen"]:
                session_metrics["highest_confidence_seen"] = conf

            action, cand = redis_tracker.process_detection(
                session_id=session_id,
                bus_id=bus_id,
                camera_id=camera_id,
                frame_id=frame_id,
                video_timestamp=video_timestamp,
                processing_timestamp=processing_timestamp,
                detection=det,
                gps_match=gps_match,
                annotated_frame=annotated_frame
            )

            if action == "CREATED":
                session_metrics["total_candidates_created"] += 1

            latest_candidate_info = {
                "candidate_id": cand["candidate_id"],
                "observation_count": cand["observation_count"],
                "best_confidence": cand["best_confidence"],
                "confidence": conf,
                "confidence_percent": det.get("confidence_percent", round(conf * 100, 1)),
                "class_name": det.get("class_name", "Pothole"),
                "bbox": cand["best_bbox"],
                "gps": cand["gps"],
                "event_id": f"EVT-{session_id}-{cand['candidate_id']}",
                "server_status": server_connection_status,
                "status": cand.get("status", "ACTIVE")
            }

    # Step 5: Check and Finalize Expired Candidates (Gap >= 2.0s)
    if redis_tracker:
        try:
            expired_candidates = redis_tracker.get_and_finalize_expired_candidates(session_id)
            for expired_cand in expired_candidates:
                try:
                    dispatch_queue.put_nowait(expired_cand)
                except queue.Full:
                    with retry_lock:
                        if len(retry_buffer) < 50:
                            retry_buffer.append(expired_cand)
        except Exception as exp_err:
            print(f"[Candidate Finalization Error] {exp_err}")

    # Encode preview for live dashboard
    annotated_base64 = None
    if len(accepted_detections) > 0 and annotated_frame is not None:
        _, preview_buf = cv2.imencode(".jpg", annotated_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
        annotated_base64 = base64.b64encode(preview_buf).decode("utf-8")

    active_count = 0
    if redis_tracker:
        try:
            active_count = len(redis_tracker.get_active_candidates(session_id))
        except Exception:
            active_count = 0

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
        "latest_event": latest_candidate_info,
        "active_candidates_count": active_count,
        "finalized_events_count": session_metrics["total_final_events_sent"],
        "server_status": server_connection_status,
        "redis_status": redis_tracker.get_redis_status()["mode"] if redis_tracker else "disconnected"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=5001, log_level="info")
