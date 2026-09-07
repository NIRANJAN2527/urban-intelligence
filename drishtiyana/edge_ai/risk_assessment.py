"""
DRISHTIYANA - Pothole Risk & Priority Assessment Module
Computes deterministic, weighted risk score (0-100), risk level, and priority
for finalized pothole candidates using:
- Detection confidence (35 pts)
- Physical severity / bounding box relative area (35 pts)
- Recurrence / multi-frame observation count (20 pts)
- Vehicle dynamics / GPS speed (10 pts)
"""

from typing import Dict, Any

# Configurable score weights (sum = 100)
WEIGHT_CONFIDENCE = 35.0
WEIGHT_SEVERITY = 35.0
WEIGHT_RECURRENCE = 20.0
WEIGHT_SPEED = 10.0


def calculate_pothole_risk(
    candidate: Dict[str, Any],
    frame_width: int = 1280,
    frame_height: int = 720
) -> Dict[str, Any]:
    """
    Evaluates risk score and operational repair priority for a finalized pothole candidate.
    Uses strictly available data without mock or invented context.
    
    Returns:
        {
            "risk_score": int (0 - 100),
            "risk_level": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
            "priority": "LOW" | "MEDIUM" | "HIGH",
            "breakdown": dict
        }
    """
    conf = float(candidate.get("best_confidence", 0.80))
    bbox = candidate.get("best_bbox") or {"x1": 0, "y1": 0, "x2": 0, "y2": 0}
    obs_count = int(candidate.get("observation_count", 1))
    gps = candidate.get("gps") or {}

    # --------------------------------------------------------------------------
    # 1. Detection Confidence Score (0 to 35 pts)
    # --------------------------------------------------------------------------
    conf_clamped = max(0.0, min(1.0, conf))
    conf_score = round(conf_clamped * WEIGHT_CONFIDENCE, 1)

    # --------------------------------------------------------------------------
    # 2. Physical Severity / Bounding Box Size (0 to 35 pts)
    # --------------------------------------------------------------------------
    bw = max(0, bbox.get("x2", 0) - bbox.get("x1", 0))
    bh = max(0, bbox.get("y2", 0) - bbox.get("y1", 0))
    bbox_area = bw * bh
    frame_area = float(max(1, frame_width * frame_height))
    area_ratio = bbox_area / frame_area  # e.g., 0.01 = 1% of frame

    # Standard pothole thresholds relative to camera field of view:
    # < 1.0% -> minor surface defect (~12 pts)
    # 1.0% to 3.5% -> moderate pothole cavity (~16-26 pts)
    # > 3.5% -> severe crater/deep trench (~28-35 pts)
    if area_ratio < 0.010:
        sev_score = 12.0
    elif area_ratio < 0.035:
        interp = (area_ratio - 0.010) / 0.025
        sev_score = 16.0 + interp * 10.0
    else:
        sev_score = min(WEIGHT_SEVERITY, 28.0 + min(7.0, (area_ratio - 0.035) * 100))
    sev_score = round(min(WEIGHT_SEVERITY, sev_score), 1)

    # --------------------------------------------------------------------------
    # 3. Recurrence / Multi-Frame Observation Count (0 to 20 pts)
    # --------------------------------------------------------------------------
    if obs_count <= 1:
        rec_score = 6.0
    elif obs_count <= 3:
        rec_score = 12.0
    elif obs_count <= 6:
        rec_score = 16.0
    else:
        rec_score = 20.0

    # --------------------------------------------------------------------------
    # 4. Vehicle Dynamics / GPS Speed (0 to 10 pts)
    # --------------------------------------------------------------------------
    raw_speed = gps.get("speed")
    if raw_speed is not None and not (isinstance(raw_speed, str) and str(raw_speed).strip() == ""):
        try:
            speed_val = float(raw_speed)
            speed_kmh = speed_val * 3.6 if speed_val < 35 else speed_val
            if speed_kmh <= 15.0:
                spd_score = 3.0  # Slow crawling traffic
            elif speed_kmh <= 40.0:
                spd_score = 7.0  # Urban street speed
            else:
                spd_score = 10.0  # Fast arterial roadway
        except (ValueError, TypeError):
            spd_score = 5.0
    else:
        spd_score = 5.0  # Neutral midpoint default

    # Total Raw Score
    total_raw = conf_score + sev_score + rec_score + spd_score
    risk_score = int(round(max(0, min(100, total_raw))))

    # --------------------------------------------------------------------------
    # 5. Risk Level & Priority Classification
    # --------------------------------------------------------------------------
    # Levels:
    # 0 - 25: LOW
    # 26 - 50: MEDIUM
    # 51 - 75: HIGH
    # 76 - 100: CRITICAL
    if risk_score <= 25:
        risk_level = "LOW"
        priority = "LOW"
    elif risk_score <= 50:
        risk_level = "MEDIUM"
        priority = "MEDIUM"
    elif risk_score <= 75:
        risk_level = "HIGH"
        priority = "HIGH"
    else:
        risk_level = "CRITICAL"
        priority = "HIGH"

    return {
        "risk_score": risk_score,
        "risk_level": risk_level,
        "priority": priority,
        "breakdown": {
            "confidence_score": conf_score,
            "severity_score": sev_score,
            "recurrence_score": rec_score,
            "speed_score": spd_score,
            "bbox_area_px": bbox_area,
            "area_percentage": round(area_ratio * 100, 2),
            "observations": obs_count
        }
    }
