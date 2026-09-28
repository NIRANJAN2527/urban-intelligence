"""
DRISHTIYANA - Redis Temporary Candidate Management Module
Aggregates raw YOLO pothole detections across consecutive frames into candidate tracks.
- Groups detections of the same physical pothole using Bounding-Box IoU, Center Distance, and Time Difference.
- Always retains the strongest observation (highest confidence, best frame, best bbox, and best evidence image).
- Finalizes candidates when unobserved for POTHOLE_CANDIDATE_GAP_SECONDS (2.0s).
- Gracefully falls back to FakeRedis or local memory if standalone Redis is offline.
- Safe Redis TTL = 30s.
"""

import json
import math
import os
import shutil
import time
from typing import Dict, Any, Optional, List, Tuple
import cv2
import numpy as np

# Configurable thresholds
SAME_POTHOLE_IOU_THRESHOLD = float(os.environ.get("SAME_POTHOLE_IOU_THRESHOLD", 0.30))
SAME_POTHOLE_CENTER_DISTANCE = float(os.environ.get("SAME_POTHOLE_CENTER_DISTANCE", 100.0))  # pixels
POTHOLE_CANDIDATE_GAP_SECONDS = float(os.environ.get("POTHOLE_CANDIDATE_GAP_SECONDS", 3.0))  # configurable candidate gap (~3s)
REDIS_CANDIDATE_TTL_SECONDS = int(os.environ.get("REDIS_CANDIDATE_TTL_SECONDS", 30))  # sliding TTL for Redis

# Redis connection parameters
REDIS_HOST = os.environ.get("REDIS_HOST", "127.0.0.1")
REDIS_PORT = int(os.environ.get("REDIS_PORT", 6379))
REDIS_DB = int(os.environ.get("REDIS_DB", 0))
REDIS_PASSWORD = os.environ.get("REDIS_PASSWORD", None)

# Directory for temporary candidate best-evidence frames
TMP_CANDIDATES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tmp_candidates")
os.makedirs(TMP_CANDIDATES_DIR, exist_ok=True)


def compute_iou(box_a: Dict[str, int], box_b: Dict[str, int]) -> float:
    """Computes standard Intersection over Union (IoU) between two bounding boxes."""
    x_a = max(box_a["x1"], box_b["x1"])
    y_a = max(box_a["y1"], box_b["y1"])
    x_b = min(box_a["x2"], box_b["x2"])
    y_b = min(box_a["y2"], box_b["y2"])

    inter_width = max(0, x_b - x_a)
    inter_height = max(0, y_b - y_a)
    inter_area = inter_width * inter_height

    if inter_area == 0:
        return 0.0

    area_a = (box_a["x2"] - box_a["x1"]) * (box_a["y2"] - box_a["y1"])
    area_b = (box_b["x2"] - box_b["x1"]) * (box_b["y2"] - box_b["y1"])
    union_area = float(area_a + area_b - inter_area)

    return inter_area / union_area if union_area > 0 else 0.0


def compute_center_distance(box_a: Dict[str, int], box_b: Dict[str, int]) -> float:
    """Calculates Euclidean pixel distance between the centers of two bounding boxes."""
    c_ax = (box_a["x1"] + box_a["x2"]) / 2.0
    c_ay = (box_a["y1"] + box_a["y2"]) / 2.0
    c_bx = (box_b["x1"] + box_b["x2"]) / 2.0
    c_by = (box_b["y1"] + box_b["y2"]) / 2.0
    return math.hypot(c_ax - c_bx, c_ay - c_by)


class RedisCandidateManager:
    """
    Manages temporary pothole candidate aggregation in Redis.
    Associates consecutive detections, preserves the highest confidence observation,
    and identifies candidates ready for finalization.
    """
    def __init__(
        self,
        host: str = REDIS_HOST,
        port: int = REDIS_PORT,
        db: int = REDIS_DB,
        password: str = REDIS_PASSWORD,
        iou_threshold: float = SAME_POTHOLE_IOU_THRESHOLD,
        center_distance_threshold: float = SAME_POTHOLE_CENTER_DISTANCE,
        candidate_gap_seconds: float = POTHOLE_CANDIDATE_GAP_SECONDS,
        ttl_seconds: int = REDIS_CANDIDATE_TTL_SECONDS
    ):
        self.host = host
        self.port = port
        self.db = db
        self.password = password
        self.iou_threshold = iou_threshold
        self.center_distance_threshold = center_distance_threshold
        self.candidate_gap_seconds = candidate_gap_seconds
        self.ttl_seconds = ttl_seconds

        self.client = None
        self.mode = "disconnected"
        self._in_memory_store: Dict[str, Any] = {}
        self._in_memory_sequences: Dict[str, int] = {}
        self._init_client()

    def _init_client(self):
        """Attempts connection to real Redis; falls back to FakeRedis or in-memory fallback."""
        import socket
        port_open = False
        try:
            s = socket.create_connection((self.host, self.port), timeout=0.25)
            s.close()
            port_open = True
        except Exception:
            port_open = False

        if port_open:
            try:
                import redis
                r = redis.Redis(
                    host=self.host,
                    port=self.port,
                    db=self.db,
                    password=self.password,
                    socket_connect_timeout=1.0,
                    decode_responses=True
                )
                r.ping()
                self.client = r
                self.mode = "standalone_redis"
                print(f"[Redis] Connected to live Redis instance at {self.host}:{self.port}")
                return
            except Exception as e:
                print(f"[Redis] Handshake failed ({e}), attempting FakeRedis fallback...")

        try:
            import fakeredis
            self.client = fakeredis.FakeRedis(decode_responses=True)
            self.mode = "fakeredis_fallback"
            print(f"[Redis] Standalone Redis not active. Using in-memory FakeRedis fallback (TTL {self.ttl_seconds}s).")
        except Exception as fe:
            print(f"[Redis Notice] FakeRedis not available ({fe}). Using safe in-memory dictionary fallback.")
            self.client = None
            self.mode = "in_memory_fallback"

    def get_redis_status(self) -> Dict[str, Any]:
        """Returns connection and mode status for diagnostics."""
        return {
            "connected": self.client is not None or self.mode == "in_memory_fallback",
            "mode": self.mode,
            "host": self.host,
            "port": self.port,
            "ttl_seconds": self.ttl_seconds,
            "candidate_gap_seconds": self.candidate_gap_seconds,
            "iou_threshold": self.iou_threshold,
            "center_distance_threshold": self.center_distance_threshold
        }

    # --------------------------------------------------------------------------
    # Storage Abstraction (Redis / In-Memory)
    # --------------------------------------------------------------------------

    def _get_key(self, session_id: str, candidate_id: str) -> str:
        return f"pothole_candidate:{session_id}:{candidate_id}"

    def _get_active_set_key(self, session_id: str) -> str:
        return f"pothole_active:{session_id}"

    def _get_seq_key(self, session_id: str) -> str:
        return f"pothole_cand_seq:{session_id}"

    def _next_candidate_id(self, session_id: str) -> str:
        """Generates a sequential candidate ID for the session, e.g. CAND001, CAND002."""
        if self.client is not None:
            try:
                seq = self.client.incr(self._get_seq_key(session_id))
                return f"CAND{int(seq):03d}"
            except Exception as err:
                print(f"[Redis Error] Increment failed: {err}")

        # Fallback counter
        curr = self._in_memory_sequences.get(session_id, 0) + 1
        self._in_memory_sequences[session_id] = curr
        return f"CAND{curr:03d}"

    def _store_candidate(self, candidate: Dict[str, Any]):
        """Saves a candidate record to Redis / in-memory store and updates active set."""
        session_id = candidate["session_id"]
        cand_id = candidate["candidate_id"]
        key = self._get_key(session_id, cand_id)
        payload = json.dumps(candidate)

        if self.client is not None:
            try:
                self.client.set(key, payload, ex=self.ttl_seconds)
                self.client.sadd(self._get_active_set_key(session_id), cand_id)
                self.client.expire(self._get_active_set_key(session_id), self.ttl_seconds)
                return
            except Exception as err:
                print(f"[Redis Error] store_candidate failed: {err}")

        # In-memory store
        self._in_memory_store[key] = candidate
        active_set_key = self._get_active_set_key(session_id)
        if active_set_key not in self._in_memory_store:
            self._in_memory_store[active_set_key] = set()
        self._in_memory_store[active_set_key].add(cand_id)

    def _remove_active_candidate(self, session_id: str, candidate_id: str):
        """Removes a finalized candidate from the active candidates set."""
        if self.client is not None:
            try:
                self.client.srem(self._get_active_set_key(session_id), candidate_id)
                return
            except Exception as err:
                print(f"[Redis Error] remove_active_candidate failed: {err}")

        active_set_key = self._get_active_set_key(session_id)
        if active_set_key in self._in_memory_store and isinstance(self._in_memory_store[active_set_key], set):
            self._in_memory_store[active_set_key].discard(candidate_id)

    def get_candidate(self, session_id: str, candidate_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves candidate record by session and ID."""
        key = self._get_key(session_id, candidate_id)
        if self.client is not None:
            try:
                raw = self.client.get(key)
                if raw:
                    return json.loads(raw)
            except Exception as err:
                print(f"[Redis Error] get_candidate failed: {err}")

        return self._in_memory_store.get(key)

    def get_active_candidates(self, session_id: str) -> List[Dict[str, Any]]:
        """Retrieves all currently active candidate objects for the given session."""
        active_ids = set()
        if self.client is not None:
            try:
                active_ids = self.client.smembers(self._get_active_set_key(session_id))
            except Exception as err:
                print(f"[Redis Error] smembers failed: {err}")
        else:
            active_set_key = self._get_active_set_key(session_id)
            active_ids = self._in_memory_store.get(active_set_key, set())

        candidates = []
        for cand_id in list(active_ids):
            cand = self.get_candidate(session_id, cand_id)
            if cand and cand.get("status") == "ACTIVE":
                candidates.append(cand)
        return candidates

    # --------------------------------------------------------------------------
    # Candidate Association & Ingestion
    # --------------------------------------------------------------------------

    def process_detection(
        self,
        session_id: str,
        bus_id: str,
        camera_id: str,
        frame_id: int,
        video_timestamp: str,
        processing_timestamp: str,
        detection: Dict[str, Any],
        gps_match: Dict[str, Any],
        annotated_frame: np.ndarray,
        current_time: Optional[float] = None
    ) -> Tuple[str, Dict[str, Any]]:
        """
        Processes a single raw YOLO detection (confidence >= 0.80).
        1. Compares with active candidates in this session using IoU, Center Distance, and Time Difference.
        2. If matched: Updates candidate observation count, last seen time, and retains strongest observation.
        3. If no match: Creates a new candidate.
        
        Returns:
            (action: 'UPDATED' | 'CREATED', candidate: Dict[str, Any])
        """
        now = current_time if current_time is not None else time.time()
        new_bbox = detection["bbox"]
        new_conf = float(detection["confidence"])

        active_candidates = self.get_active_candidates(session_id)

        best_match_candidate = None
        best_match_score = -1.0  # We rank matches primarily by IoU, secondarily by center distance

        for cand in active_candidates:
            # Check time difference
            time_diff = now - cand.get("last_seen_time", 0.0)
            if time_diff > self.candidate_gap_seconds:
                continue

            ref_bbox = cand.get("latest_bbox", cand.get("best_bbox"))
            iou = compute_iou(new_bbox, ref_bbox)
            dist = compute_center_distance(new_bbox, ref_bbox)

            # Match criteria: IoU >= threshold OR Center Distance <= threshold
            is_match = (iou >= self.iou_threshold) or (dist <= self.center_distance_threshold)

            if is_match:
                # Use IoU + normalized distance bonus as matching score
                match_score = iou + max(0.0, (self.center_distance_threshold - dist) / self.center_distance_threshold)
                if match_score > best_match_score:
                    best_match_score = match_score
                    best_match_candidate = cand

        # ======================================================================
        # CASE 1: MATCH EXISTING CANDIDATE
        # ======================================================================
        if best_match_candidate is not None:
            cand_id = best_match_candidate["candidate_id"]
            best_match_candidate["observation_count"] = best_match_candidate.get("observation_count", 1) + 1
            best_match_candidate["last_seen_time"] = now
            best_match_candidate["last_seen_video_timestamp"] = video_timestamp
            best_match_candidate["latest_bbox"] = new_bbox

            old_best_conf = float(best_match_candidate["best_confidence"])
            print(f"[YOLO] Pothole detected: confidence={new_conf:.2f}")
            print(f"[REDIS] Matched candidate: {cand_id}")

            if new_conf > old_best_conf:
                # Stronger observation found -> update best evidence
                best_match_candidate["best_confidence"] = new_conf
                best_match_candidate["best_frame_id"] = frame_id
                best_match_candidate["best_video_timestamp"] = video_timestamp
                best_match_candidate["best_processing_timestamp"] = processing_timestamp
                best_match_candidate["best_bbox"] = new_bbox

                # GPS stored with the best evidence must correspond to that frame's detection timestamp
                new_gps = gps_match or {}
                has_new_valid_gps = (
                    new_gps.get("latitude") is not None and
                    new_gps.get("longitude") is not None and
                    new_gps.get("gps_match_status") == "GPS MATCHED"
                )

                if has_new_valid_gps:
                    best_match_candidate["gps"] = new_gps
                else:
                    old_gps = best_match_candidate.get("gps") or {}
                    has_old_valid_gps = (
                        old_gps.get("latitude") is not None and
                        old_gps.get("longitude") is not None and
                        old_gps.get("gps_match_status") == "GPS MATCHED"
                    )
                    if has_old_valid_gps:
                        best_match_candidate["gps"] = old_gps
                    else:
                        best_match_candidate["gps"] = new_gps if new_gps else {
                            "latitude": None,
                            "longitude": None,
                            "gps_timestamp": None,
                            "accuracy": None,
                            "timestamp_difference_ms": None,
                            "gps_match_status": "GPS_UNAVAILABLE"
                        }

                # Overwrite best evidence frame image
                frame_path = best_match_candidate.get("best_frame_path")
                if not frame_path:
                    frame_path = os.path.join(TMP_CANDIDATES_DIR, f"{session_id}_{cand_id}.jpg")
                    best_match_candidate["best_frame_path"] = frame_path
                if frame_path and annotated_frame is not None:
                    try:
                        cv2.imwrite(frame_path, annotated_frame)
                    except Exception as fe:
                        print(f"[Redis Warning] Failed to overwrite evidence frame: {fe}")

                print(f"[REDIS] Best confidence updated: {new_conf:.2f}")
            else:
                # If candidate currently has no GPS, but this observation frame has valid GPS, attach it
                old_gps = best_match_candidate.get("gps") or {}
                new_gps = gps_match or {}
                if (old_gps.get("latitude") is None) and (new_gps.get("latitude") is not None and new_gps.get("gps_match_status") == "GPS MATCHED"):
                    best_match_candidate["gps"] = new_gps
                    print(f"[REDIS] Attached valid GPS to candidate {cand_id}: ({new_gps['latitude']}, {new_gps['longitude']})")

                print(f"[REDIS] Retained best confidence: {old_best_conf:.2f} (observations={best_match_candidate['observation_count']})")

            self._store_candidate(best_match_candidate)
            return "UPDATED", best_match_candidate

        # ======================================================================
        # CASE 2: CREATE NEW CANDIDATE
        # ======================================================================
        cand_id = self._next_candidate_id(session_id)
        evidence_filename = f"{session_id}_{cand_id}.jpg"
        evidence_path = os.path.join(TMP_CANDIDATES_DIR, evidence_filename)

        if annotated_frame is not None:
            try:
                cv2.imwrite(evidence_path, annotated_frame)
            except Exception as fe:
                print(f"[Redis Warning] Failed to write initial evidence frame: {fe}")

        new_candidate = {
            "candidate_id": cand_id,
            "session_id": session_id,
            "bus_id": bus_id,
            "camera_id": camera_id,
            "event_type": "POTHOLE",
            "class_name": detection.get("class_name", "Pothole"),
            "best_confidence": new_conf,
            "best_frame_id": frame_id,
            "best_video_timestamp": video_timestamp,
            "best_processing_timestamp": processing_timestamp,
            "best_bbox": new_bbox,
            "latest_bbox": new_bbox,
            "first_seen_video_timestamp": video_timestamp,
            "last_seen_video_timestamp": video_timestamp,
            "first_seen_time": now,
            "last_seen_time": now,
            "observation_count": 1,
            "gps": gps_match,
            "best_frame_path": evidence_path,
            "status": "ACTIVE"
        }

        print(f"[YOLO] Pothole detected: confidence={new_conf:.2f}")
        print(f"[REDIS] New candidate: {cand_id}")

        self._store_candidate(new_candidate)
        return "CREATED", new_candidate

    # --------------------------------------------------------------------------
    # Candidate Finalization
    # --------------------------------------------------------------------------

    def get_and_finalize_expired_candidates(
        self,
        session_id: str,
        current_time: Optional[float] = None
    ) -> List[Dict[str, Any]]:
        """
        Scans active candidates for the given session.
        If a candidate has not received an observation for > POTHOLE_CANDIDATE_GAP_SECONDS,
        it transitions to FINALIZED status, is removed from active candidates,
        and is returned for final event dispatch.
        """
        now = current_time if current_time is not None else time.time()
        active_candidates = self.get_active_candidates(session_id)
        finalized_list = []

        for cand in active_candidates:
            last_seen = cand.get("last_seen_time", 0.0)
            gap = now - last_seen

            if gap >= self.candidate_gap_seconds:
                cand_id = cand["candidate_id"]
                cand["status"] = "FINALIZED"
                cand["finalized_at"] = now
                
                # Update status in Redis
                self._store_candidate(cand)
                # Remove from active tracking set
                self._remove_active_candidate(session_id, cand_id)

                print(f"[REDIS] Candidate {cand_id} finalized (observed {cand['observation_count']} times, best={cand['best_confidence']:.2f})")
                print(f"[EVENT] Final pothole event created: EVT-{session_id}-{cand_id}")

                finalized_list.append(cand)

        return finalized_list

    def cleanup_all_session_data(self, session_id: str):
        """Cleans up Redis keys and temporary evidence files for a session."""
        active_candidates = self.get_active_candidates(session_id)
        for cand in active_candidates:
            path = cand.get("best_frame_path")
            if path and os.path.exists(path):
                try:
                    os.remove(path)
                except Exception:
                    pass

        if self.client is not None:
            try:
                self.client.delete(self._get_active_set_key(session_id))
                self.client.delete(self._get_seq_key(session_id))
            except Exception:
                pass


# Backward compatibility alias for any existing imports
RedisBestDetectionTracker = RedisCandidateManager
