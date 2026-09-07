"""
DRISHTIYANA - Redis Best-Detection Tracking Module
Implements temporary best-detection storage with a 30-second sliding expiration window.
- Compares incoming pothole detections against the current best candidate.
- Updates Redis only when higher confidence is observed.
- Sets TTL = 30 seconds on every active window.
- Gracefully falls back to FakeRedis if standalone Redis server is offline.
"""

import json
import os
import time
from typing import Dict, Any, Optional, Tuple
import redis

# Redis connection parameters
REDIS_HOST = os.environ.get("REDIS_HOST", "127.0.0.1")
REDIS_PORT = int(os.environ.get("REDIS_PORT", 6379))
REDIS_DB = int(os.environ.get("REDIS_DB", 0))
REDIS_PASSWORD = os.environ.get("REDIS_PASSWORD", None)

# Default TTL per event window
DETECTION_WINDOW_TTL_SECONDS = 30


class RedisBestDetectionTracker:
    def __init__(self, host: str = REDIS_HOST, port: int = REDIS_PORT, db: int = REDIS_DB, password: str = REDIS_PASSWORD):
        self.host = host
        self.port = port
        self.db = db
        self.password = password
        self.client = None
        self.is_fake = False
        self._init_client()

    def _init_client(self):
        """Attempts connection to real Redis; falls back to FakeRedis if offline."""
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
                self.is_fake = False
                print(f"[Redis] Connected to live Redis instance at {self.host}:{self.port}")
                return
            except Exception as e:
                print(f"[Redis] Handshake failed ({e}), falling back...")

        try:
            import fakeredis
            self.client = fakeredis.FakeRedis(decode_responses=True)
            self.is_fake = True
            print(f"[Redis] Standalone Redis not active. Using in-memory FakeRedis fallback (TTL {DETECTION_WINDOW_TTL_SECONDS}s).")
        except Exception as fe:
            print(f"[Redis ERROR] Neither Redis nor FakeRedis could be initialized: {fe}")
            self.client = None

    def get_redis_status(self) -> Dict[str, Any]:
        """Returns connection and mode status for diagnostics."""
        return {
            "connected": self.client is not None,
            "mode": "standalone_redis" if not self.is_fake else "fakeredis_fallback",
            "host": self.host,
            "port": self.port,
            "ttl_seconds": DETECTION_WINDOW_TTL_SECONDS
        }

    @staticmethod
    def compute_cluster_key(video_timestamp_ms: int, window_ms: int = 3000) -> str:
        """
        Groups detections occurring within the same ~3-second temporal window
        representing the observation of the same road pothole cluster.
        """
        cluster_bucket = int(video_timestamp_ms // window_ms)
        return f"cluster_{cluster_bucket}"

    def update_best_detection(
        self,
        session_id: str,
        cluster_key: str,
        candidate_data: Dict[str, Any],
        ttl_seconds: int = DETECTION_WINDOW_TTL_SECONDS
    ) -> Tuple[bool, Dict[str, Any], float]:
        """
        Updates the Redis record for this event key ONLY IF:
        1. No candidate currently exists in Redis (new event), OR
        2. The candidate's confidence is higher than the currently cached score.

        Returns:
            (is_new_best: bool, current_best_record: dict, best_confidence: float)
        """
        if self.client is None:
            # If Redis client is completely unavailable, treat candidate as best standalone
            return True, candidate_data, candidate_data.get("confidence", 0.0)

        redis_key = f"pothole:{session_id}:{cluster_key}"
        new_conf = float(candidate_data.get("confidence", 0.0))

        existing_raw = self.client.get(redis_key)

        if existing_raw is None:
            # Case 1: First detection in window
            candidate_payload = json.dumps(candidate_data)
            self.client.set(redis_key, candidate_payload, ex=ttl_seconds)
            return True, candidate_data, new_conf

        # Case 2: Candidate exists in window -> compare scores
        try:
            existing_record = json.loads(existing_raw)
            old_conf = float(existing_record.get("confidence", 0.0))

            if new_conf > old_conf:
                # Replace with higher confidence candidate & reset 30s TTL
                candidate_payload = json.dumps(candidate_data)
                self.client.set(redis_key, candidate_payload, ex=ttl_seconds)
                return True, candidate_data, new_conf
            else:
                # Existing candidate remains best; retain remaining TTL
                return False, existing_record, old_conf
        except Exception as err:
            print(f"[Redis] Error parsing existing candidate: {err}")
            # Overwrite corrupted key
            self.client.set(redis_key, json.dumps(candidate_data), ex=ttl_seconds)
            return True, candidate_data, new_conf

    def get_best_detection(self, session_id: str, cluster_key: str) -> Optional[Dict[str, Any]]:
        """Retrieves currently stored best detection for a cluster, or None if expired."""
        if self.client is None:
            return None
        redis_key = f"pothole:{session_id}:{cluster_key}"
        raw = self.client.get(redis_key)
        if raw:
            try:
                return json.loads(raw)
            except Exception:
                return None
        return None
