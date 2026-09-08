"""
DRISHTIYANA - Uploaded Video Timestamp Synchronization & AI Pipeline
====================================================================
Performs deterministic frame-to-GPS timestamp synchronization for prerecorded
road inspection videos (.mp4, .avi, .mov, .webm) and uploaded GPS datasets (.csv, .json).

PIPELINE SPECIFICATION:
-----------------------
STEP 1: Read uploaded GPS file; extract the FIRST timestamp as video_start_time.
STEP 2: Open uploaded video using OpenCV; extract FPS and total frames.
STEP 3: Process frames sequentially; calculate elapsed_seconds = frame_number / FPS;
        compute frame_timestamp = video_start_time + elapsed_seconds.
        (Pure OpenCV timing — no OCR or visual timestamps).
STEP 4: Nearest GPS lookup from uploaded GPS dataset using calculated frame timestamp.
STEP 5: Feed frame into existing image enhancement (CLAHE + brightness + sharpening)
        and existing YOLO pothole detection (confidence >= 0.80).
STEP 6: When pothole detected, associate Frame, Frame Timestamp, Latitude, Longitude.
STEP 7: Ingest into existing Redis Candidate Manager; retain highest confidence observation.
        Finalize candidates and dispatch structured events with video_source to backend.

COMPLETELY ISOLATED from Live Bus Sensor mode.
"""

import argparse
import csv
import json
import math
import os
import sys
import time
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional, Tuple, Callable

import cv2
import numpy as np
import requests

from enhancement import enhance_frame
from detector import PotholeDetector, DEFAULT_MODEL_PATH
from redis_tracker import RedisCandidateManager
from gps_matcher import get_gps_for_video_timestamp, parse_timestamp_to_ms
from risk_assessment import calculate_pothole_risk


# ==============================================================================
# 1. GPS PARSING & REFERENCE TIMESTAMP EXTRACTION (STEP 1)
# ==============================================================================

def parse_iso_datetime(ts_str: str) -> datetime:
    """
    Parses an ISO-8601 string (with 'Z' or offset) into a timezone-aware UTC datetime.
    """
    if not ts_str or not isinstance(ts_str, str):
        raise ValueError(f"Invalid timestamp string: {ts_str}")
    
    clean_str = ts_str.strip().replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(clean_str)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        else:
            dt = dt.astimezone(timezone.utc)
        return dt
    except Exception as e:
        # Try numeric epoch
        try:
            val = float(ts_str)
            if val > 10000000000:
                val /= 1000.0
            return datetime.fromtimestamp(val, tz=timezone.utc)
        except Exception:
            raise ValueError(f"Unable to parse timestamp '{ts_str}': {e}")


def format_iso_datetime(dt: datetime) -> str:
    """
    Formats a datetime object into a standardized ISO-8601 UTC string (e.g. 2026-09-08T10:00:32.500Z).
    """
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    ms = int(dt.microsecond / 1000)
    return dt.strftime("%Y-%m-%dT%H:%M:%S") + f".{ms:03d}Z"


def parse_gps_source(gps_source: Any) -> List[Dict[str, Any]]:
    """
    Parses GPS data from a filepath (.csv / .json), a raw string, or a pre-parsed list.
    Returns a chronologically sorted list of standardized GPS dictionaries.
    """
    records: List[Dict[str, Any]] = []

    if isinstance(gps_source, list):
        # Already a list of objects
        raw_list = gps_source
    elif isinstance(gps_source, str):
        if os.path.exists(gps_source):
            ext = os.path.splitext(gps_source)[1].lower()
            with open(gps_source, "r", encoding="utf-8") as f:
                content = f.read().strip()
            if ext == ".csv" or (not ext and "," in content.split("\n")[0]):
                raw_list = _parse_csv_string(content)
            else:
                raw_list = json.loads(content)
        else:
            stripped = gps_source.strip()
            if stripped.startswith("[") or stripped.startswith("{"):
                parsed = json.loads(stripped)
                raw_list = parsed if isinstance(parsed, list) else [parsed]
            else:
                raw_list = _parse_csv_string(stripped)
    else:
        raise ValueError(f"Unsupported GPS input type: {type(gps_source)}")

    # Standardize records
    for i, item in enumerate(raw_list):
        ts_raw = item.get("timestamp") or item.get("gps_timestamp") or item.get("time")
        if not ts_raw:
            continue
        lat = item.get("latitude") if item.get("latitude") is not None else item.get("lat")
        lon = item.get("longitude") if item.get("longitude") is not None else (item.get("lon") or item.get("lng"))
        if lat is None or lon is None:
            continue

        try:
            dt = parse_iso_datetime(str(ts_raw))
            records.append({
                "timestamp": format_iso_datetime(dt),
                "latitude": round(float(lat), 6),
                "longitude": round(float(lon), 6),
                "accuracy": round(float(item.get("accuracy", 5.0)), 1) if item.get("accuracy") is not None else None,
                "speed": round(float(item.get("speed", 0.0)), 2) if item.get("speed") is not None else None,
                "heading": round(float(item.get("heading", 0.0)), 1) if item.get("heading") is not None else None,
            })
        except Exception:
            continue

    if not records:
        raise ValueError("No valid GPS records found in provided input.")

    # Chronologically sort by timestamp
    records.sort(key=lambda r: parse_iso_datetime(r["timestamp"]))
    return records


def _parse_csv_string(csv_text: str) -> List[Dict[str, Any]]:
    """Helper to parse a CSV text string into a list of dictionaries."""
    lines = [line.strip() for line in csv_text.strip().splitlines() if line.strip()]
    if not lines:
        return []
    reader = csv.DictReader(lines)
    # Normalize headers
    normalized = []
    for row in reader:
        norm_row = {k.strip().lower(): v.strip() for k, v in row.items() if k}
        normalized.append(norm_row)
    return normalized


def extract_gps_reference_start_time(gps_records: List[Dict[str, Any]]) -> Tuple[str, datetime]:
    """
    Extracts the FIRST timestamp from the sorted GPS records as the reference start time.
    Returns (iso_string, datetime_object).
    """
    if not gps_records:
        raise ValueError("GPS records list is empty; cannot extract reference start time.")
    start_iso = gps_records[0]["timestamp"]
    start_dt = parse_iso_datetime(start_iso)
    return start_iso, start_dt


# ==============================================================================
# 2. DETERMINISTIC OPENCV FRAME TIMING (STEPS 2 & 3)
# ==============================================================================

def calculate_frame_timestamp(
    video_start_dt: datetime,
    frame_number: int,
    fps: float
) -> Tuple[str, int, float]:
    """
    STEP 3:
    frame_number = current frame index (0, 1, 2, ...)
    elapsed_seconds = frame_number / FPS
    frame_timestamp = video_start_time + elapsed_seconds

    Returns:
        (frame_timestamp_iso, frame_timestamp_ms, elapsed_seconds)
    """
    safe_fps = max(float(fps), 1.0)
    elapsed_seconds = float(frame_number) / safe_fps
    frame_dt = video_start_dt + timedelta(seconds=elapsed_seconds)
    frame_timestamp_iso = format_iso_datetime(frame_dt)
    frame_timestamp_ms = int(frame_dt.timestamp() * 1000)
    return frame_timestamp_iso, frame_timestamp_ms, elapsed_seconds


# ==============================================================================
# 3. BACKEND DISPATCH HELPER
# ==============================================================================

def dispatch_finalized_event_to_backend(
    candidate: Dict[str, Any],
    node_backend_url: str = "http://127.0.0.1:3000",
    timeout_sec: float = 8.0
) -> bool:
    """
    Dispatches a finalized candidate event to the Node.js backend POST /api/edge/events.
    """
    session_id = candidate.get("session_id", "UNKNOWN")
    cand_id = candidate.get("candidate_id", "CAND000")
    event_id = f"EVT-{session_id}-{cand_id}"

    # Deterministic Risk & Priority assessment
    risk_data = calculate_pothole_risk(candidate)
    candidate["risk_score"] = risk_data["risk_score"]
    candidate["risk_level"] = risk_data["risk_level"]
    candidate["priority"] = risk_data["priority"]

    evidence_path = candidate.get("best_frame_path")
    evidence_bytes = None
    if evidence_path and os.path.exists(evidence_path):
        try:
            with open(evidence_path, "rb") as f:
                evidence_bytes = f.read()
        except Exception as e:
            print(f"[Upload Dispatcher] Could not read evidence image: {e}")

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
        "processing_timestamp": candidate.get("best_processing_timestamp", datetime.now(timezone.utc).isoformat()),
        "confidence": str(candidate.get("best_confidence", 0.0)),
        "class_name": candidate.get("class_name", "Pothole"),
        "bbox_x1": str(best_bbox.get("x1", 0)),
        "bbox_y1": str(best_bbox.get("y1", 0)),
        "bbox_x2": str(best_bbox.get("x2", 0)),
        "bbox_y2": str(best_bbox.get("y2", 0)),
        "observation_count": str(candidate.get("observation_count", 1)),
        "risk_score": str(candidate["risk_score"]),
        "risk_level": candidate["risk_level"],
        "priority": candidate["priority"],
        "latitude": str(gps.get("latitude")) if gps.get("latitude") is not None else "",
        "longitude": str(gps.get("longitude")) if gps.get("longitude") is not None else "",
        "gps_timestamp": str(gps.get("gps_timestamp")) if gps.get("gps_timestamp") else "",
        "gps_accuracy": str(gps.get("accuracy")) if gps.get("accuracy") is not None else "",
        "timestamp_difference_ms": str(gps.get("timestamp_difference_ms")) if gps.get("timestamp_difference_ms") is not None else "",
        "gps_match_status": str(gps.get("gps_match_status", "UNCHECKED")),
        "video_source": candidate.get("video_source", "uploaded_recording"),
        "source_type": "UPLOAD",
        "best_frame_path": evidence_path if evidence_path else ""
    }

    files = {}
    if evidence_bytes:
        files = {"evidence_image": ("evidence.jpg", evidence_bytes, "image/jpeg")}

    try:
        resp = requests.post(f"{node_backend_url}/api/edge/events", data=data, files=files, timeout=timeout_sec)
        if resp.status_code in [200, 201]:
            print(f"[Upload Pipeline -> Backend] Event persisted: {event_id} | GPS: ({data['latitude']}, {data['longitude']}) | Conf: {float(data['confidence']):.2f}")
            return True
        else:
            print(f"[Upload Pipeline -> Backend Warning] Backend responded {resp.status_code} for {event_id}")
            return False
    except Exception as err:
        print(f"[Upload Pipeline -> Backend Error] Failed to dispatch {event_id}: {err}")
        return False


# ==============================================================================
# 4. CORE PIPELINE: PROCESS UPLOADED RECORDED VIDEO (STEPS 1 - 7)
# ==============================================================================

def process_uploaded_video(
    video_path: str,
    gps_source: Any,
    session_id: str = "SESSION-UPLOAD-001",
    bus_id: str = "BUS-101",
    camera_id: str = "CAM-01",
    video_source: Optional[str] = None,
    detector: Optional[PotholeDetector] = None,
    redis_tracker: Optional[RedisCandidateManager] = None,
    node_backend_url: str = "http://127.0.0.1:3000",
    dispatch_to_server: bool = True,
    progress_callback: Optional[Callable[[int, int, Dict[str, Any]], None]] = None,
    frame_step: int = 1
) -> Dict[str, Any]:
    """
    Executes the complete 7-step Timestamp Synchronization and Pothole AI Pipeline
    on an uploaded recorded video.
    """
    if not os.path.exists(video_path):
        raise FileNotFoundError(f"Video file not found at: {video_path}")

    # Set default video_source label
    if not video_source:
        video_source = os.path.basename(video_path)

    # --------------------------------------------------------------------------
    # STEP 1: Read GPS & Extract FIRST Timestamp
    # --------------------------------------------------------------------------
    print("\n=======================================================")
    print(f" [Uploaded Video Sync] Starting Processing")
    print(f" Video: {video_path}")
    print(f" Session: {session_id} | Bus: {bus_id}")
    print("=======================================================")

    gps_records = parse_gps_source(gps_source)
    video_start_time_iso, video_start_dt = extract_gps_reference_start_time(gps_records)

    print(f"[STEP 1] GPS Loaded: {len(gps_records)} records")
    print(f"[STEP 1] Reference Start Timestamp: {video_start_time_iso}")

    # --------------------------------------------------------------------------
    # STEP 2: Open Video via OpenCV, extract FPS & Total Frames
    # --------------------------------------------------------------------------
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"OpenCV failed to open video file: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps <= 0 or math.isnan(fps):
        fps = 30.0  # Fallback to standard 30 FPS
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    video_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    video_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    print(f"[STEP 2] OpenCV Opened: {video_width}x{video_height} @ {fps:.2f} FPS | Total Frames: {total_frames}")

    # Initialize AI components if not supplied
    owns_detector = False
    if detector is None:
        detector = PotholeDetector()
        owns_detector = True

    owns_redis = False
    if redis_tracker is None:
        redis_tracker = RedisCandidateManager()
        owns_redis = True

    # Tracking state
    processed_frames = 0
    detections_found = 0
    finalized_events: List[Dict[str, Any]] = []
    frame_index = 0
    t_pipeline_start = time.time()

    # --------------------------------------------------------------------------
    # STEPS 3 - 7: Sequential Frame Processing & Timestamp Sync
    # --------------------------------------------------------------------------
    try:
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret or frame is None:
                break

            current_frame_id = frame_index
            frame_index += 1

            # Optional frame stepping (default 1 = every single frame)
            if frame_step > 1 and (current_frame_id % frame_step != 0):
                continue

            # STEP 3: Timing calculation via OpenCV timing only
            frame_timestamp_iso, frame_timestamp_ms, elapsed_seconds = calculate_frame_timestamp(
                video_start_dt=video_start_dt,
                frame_number=current_frame_id,
                fps=fps
            )

            # STEP 4: Nearest GPS lookup using calculated frame timestamp
            gps_match = get_gps_for_video_timestamp(frame_timestamp_ms, gps_records)

            # STEP 5: Existing Image Enhancement Pipeline (CLAHE, Brightness, Sharpening)
            enhanced_frame = enhance_frame(frame)

            # STEP 5 (cont): Existing YOLO pothole detection (confidence >= 0.80)
            accepted_detections, annotated_frame = detector.detect(enhanced_frame)

            processing_timestamp = datetime.now(timezone.utc).isoformat()

            # STEP 6 & 7: Associate Frame + Timestamp + GPS with Detections & Redis Ingestion
            if len(accepted_detections) > 0 and redis_tracker:
                detections_found += len(accepted_detections)

                for det in accepted_detections:
                    action, cand = redis_tracker.process_detection(
                        session_id=session_id,
                        bus_id=bus_id,
                        camera_id=camera_id,
                        frame_id=current_frame_id,
                        video_timestamp=frame_timestamp_iso,
                        processing_timestamp=processing_timestamp,
                        detection=det,
                        gps_match=gps_match,
                        annotated_frame=annotated_frame,
                        current_time=elapsed_seconds
                    )
                    cand["video_source"] = video_source

            # Check and finalize candidates that exceeded candidate gap in video time
            if redis_tracker:
                expired = redis_tracker.get_and_finalize_expired_candidates(
                    session_id=session_id,
                    current_time=elapsed_seconds
                )
                for exp in expired:
                    exp["video_source"] = video_source
                    finalized_events.append(exp)
                    if dispatch_to_server:
                        dispatch_finalized_event_to_backend(exp, node_backend_url)

            processed_frames += 1

            # Progress callback if registered
            if progress_callback and (processed_frames % 10 == 0 or processed_frames == total_frames):
                stats = {
                    "processed_frames": processed_frames,
                    "total_frames": total_frames,
                    "elapsed_video_sec": elapsed_seconds,
                    "current_timestamp": frame_timestamp_iso,
                    "detections_count": detections_found,
                    "finalized_count": len(finalized_events)
                }
                progress_callback(processed_frames, total_frames, stats)

    finally:
        cap.release()

    # --------------------------------------------------------------------------
    # FINALIZATION: Flush remaining active candidates at end of video
    # --------------------------------------------------------------------------
    if redis_tracker:
        last_elapsed = float(total_frames) / max(fps, 1.0)
        remaining = redis_tracker.get_and_finalize_expired_candidates(
            session_id=session_id,
            current_time=last_elapsed + 1000.0  # Force finalize all remaining
        )
        for rem in remaining:
            rem["video_source"] = video_source
            finalized_events.append(rem)
            if dispatch_to_server:
                dispatch_finalized_event_to_backend(rem, node_backend_url)

    total_processing_time = round(time.time() - t_pipeline_start, 2)
    avg_fps = round(processed_frames / max(total_processing_time, 0.001), 1)

    print("\n=======================================================")
    print(f" [Uploaded Video Sync] Processing Complete!")
    print(f" Frames Processed: {processed_frames}/{total_frames} ({avg_fps} FPS)")
    print(f" Detections Found: {detections_found}")
    print(f" Finalized Pothole Events: {len(finalized_events)}")
    print(f" Time Elapsed: {total_processing_time}s")
    print("=======================================================\n")

    return {
        "success": True,
        "session_id": session_id,
        "bus_id": bus_id,
        "video_source": video_source,
        "video_start_time": video_start_time_iso,
        "fps": round(fps, 2),
        "total_frames": total_frames,
        "processed_frames": processed_frames,
        "detections_found": detections_found,
        "finalized_events_count": len(finalized_events),
        "finalized_events": finalized_events,
        "processing_time_seconds": total_processing_time,
        "average_fps": avg_fps
    }


# ==============================================================================
# 5. CLI INTERFACE
# ==============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="DRISHTIYANA - Uploaded Video Timestamp Synchronization & AI Pipeline"
    )
    parser.add_argument("--video", required=True, help="Path to input video file (.mp4, .avi, .mov, .webm)")
    parser.add_argument("--gps", required=True, help="Path to input GPS file (.csv or .json)")
    parser.add_argument("--session-id", default=f"SESSION-UPLOAD-{int(time.time())}", help="Session identifier")
    parser.add_argument("--bus-id", default="BUS-101", help="Bus identifier")
    parser.add_argument("--backend-url", default="http://127.0.0.1:3000", help="Node.js backend URL")
    parser.add_argument("--no-dispatch", action="store_true", help="Disable dispatching finalized events to backend")
    parser.add_argument("--frame-step", type=int, default=1, help="Process every Nth frame (default: 1)")

    args = parser.parse_args()

    result = process_uploaded_video(
        video_path=args.video,
        gps_source=args.gps,
        session_id=args.session_id,
        bus_id=args.bus_id,
        node_backend_url=args.backend_url,
        dispatch_to_server=not args.no_dispatch,
        frame_step=args.frame_step
    )

    print(json.dumps({
        "session_id": result["session_id"],
        "video_start_time": result["video_start_time"],
        "processed_frames": result["processed_frames"],
        "detections_found": result["detections_found"],
        "finalized_events_count": result["finalized_events_count"]
    }, indent=2))


if __name__ == "__main__":
    main()
