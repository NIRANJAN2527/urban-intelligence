"""
DRISHTIYANA - Vehicle Detection & Counting Module
Loads pretrained yolo11n.pt model independently from pothole model.
Performs vehicle inference restricted strictly to:
  - Car (class ID 2)
  - Motorcycle (class ID 3)
  - Bus (class ID 5)
  - Truck (class ID 7)
All other COCO classes (person, bicycle, dog, etc.) are ignored via classes=[2, 3, 5, 7].
Confidence threshold is conf=0.5.
Computes real-time vehicle counts for spatial/temporal traffic density aggregation.
"""

import os
import cv2
import numpy as np
from typing import Dict, Any, List, Tuple, Optional
from ultralytics import YOLO

# Pretrained vehicle model path specified by user
DEFAULT_VEHICLE_MODEL_PATH = r"C:\Users\K.Niranjan\vehicle_project\yolo11n.pt"

# Strict vehicle class mapping from COCO dataset
VEHICLE_CLASS_IDS = [2, 3, 5, 7]
VEHICLE_CLASS_MAP = {
    2: "car",
    3: "motorcycle",
    5: "bus",
    7: "truck"
}

# Verified vehicle confidence threshold
VEHICLE_CONFIDENCE_THRESHOLD = 0.50


class VehicleDetector:
    """
    Independent vehicle detector module.
    Maintains its own YOLO instance and does NOT share mutable state with PotholeDetector.
    """
    def __init__(
        self,
        model_path: str = DEFAULT_VEHICLE_MODEL_PATH,
        confidence_threshold: float = VEHICLE_CONFIDENCE_THRESHOLD
    ):
        self.model_path = os.environ.get("VEHICLE_MODEL_PATH", model_path)
        self.confidence_threshold = confidence_threshold
        self.model: Optional[YOLO] = None
        self.target_classes = VEHICLE_CLASS_IDS
        self.load_model()

    def load_model(self):
        """Loads vehicle YOLO model once during startup."""
        if not os.path.exists(self.model_path):
            raise FileNotFoundError(f"Vehicle YOLO model not found at specified path: {self.model_path}")

        print(f"[VehicleDetector] Loading YOLO vehicle model from: {self.model_path} ...")
        self.model = YOLO(self.model_path)
        # Warmup with dummy image to initialize model tensors in memory
        dummy = np.zeros((640, 640, 3), dtype=np.uint8)
        self.model.predict(dummy, classes=self.target_classes, conf=self.confidence_threshold, verbose=False)
        print(f"[VehicleDetector] Model loaded successfully! Target classes: {VEHICLE_CLASS_MAP}")

    def detect(self, frame: np.ndarray) -> Dict[str, Any]:
        """
        Runs YOLO vehicle inference on input frame with strict class filtering:
        classes=[2, 3, 5, 7], conf=0.5.

        Returns:
            {
                "counts": {
                    "car": int,
                    "motorcycle": int,
                    "bus": int,
                    "truck": int,
                    "total": int
                },
                "total_vehicles": int,
                "detections": List[Dict[str, Any]]
            }
        """
        counts = {
            "car": 0,
            "motorcycle": 0,
            "bus": 0,
            "truck": 0,
            "total": 0
        }
        detections: List[Dict[str, Any]] = []

        if self.model is None or frame is None:
            return {
                "counts": counts,
                "total_vehicles": 0,
                "detections": detections
            }

        try:
            # Strictly filter at YOLO inference level
            results = self.model.predict(
                frame,
                classes=self.target_classes,
                conf=self.confidence_threshold,
                verbose=False
            )

            if not results or len(results) == 0:
                return {
                    "counts": counts,
                    "total_vehicles": 0,
                    "detections": detections
                }

            result = results[0]
            boxes = result.boxes

            if boxes is not None and len(boxes) > 0:
                for box in boxes:
                    cls_id = int(box.cls[0].cpu().item())
                    conf = float(box.conf[0].cpu().item())

                    # Verify class is strictly one of the 4 vehicle classes
                    vehicle_type = VEHICLE_CLASS_MAP.get(cls_id)
                    if not vehicle_type:
                        continue

                    # Increment verified vehicle class count
                    counts[vehicle_type] += 1

                    # Bounding box coordinates
                    xyxy = box.xyxy[0].cpu().numpy()
                    x1, y1, x2, y2 = int(xyxy[0]), int(xyxy[1]), int(xyxy[2]), int(xyxy[3])

                    detections.append({
                        "class_id": cls_id,
                        "class_name": vehicle_type,
                        "confidence": round(conf, 4),
                        "confidence_percent": round(conf * 100, 1),
                        "bbox": {
                            "x1": x1,
                            "y1": y1,
                            "x2": x2,
                            "y2": y2
                        }
                    })

            # Calculate total vehicles
            total = counts["car"] + counts["motorcycle"] + counts["bus"] + counts["truck"]
            counts["total"] = total

            return {
                "counts": counts,
                "total_vehicles": total,
                "detections": detections
            }

        except Exception as err:
            print(f"[VehicleDetector Error] Inference failed: {err}")
            return {
                "counts": counts,
                "total_vehicles": 0,
                "detections": detections,
                "error": str(err)
            }

    @staticmethod
    def draw_detections(image: np.ndarray, detections: List[Dict[str, Any]]) -> np.ndarray:
        """
        Draws vehicle bounding boxes with clean visual labels.
        Colors:
          Car: Sky Blue (235, 150, 50)
          Motorcycle: Orange (40, 140, 245)
          Bus: Purple (200, 70, 160)
          Truck: Teal (180, 200, 40)
        """
        annotated = image.copy()
        color_map = {
            "car": (235, 150, 50),
            "motorcycle": (40, 140, 245),
            "bus": (200, 70, 160),
            "truck": (180, 200, 40)
        }

        for det in detections:
            bbox = det["bbox"]
            x1, y1, x2, y2 = bbox["x1"], bbox["y1"], bbox["x2"], bbox["y2"]
            v_type = det["class_name"]
            conf_pct = det.get("confidence_percent", round(det.get("confidence", 0) * 100, 1))
            color = color_map.get(v_type, (200, 200, 200))

            cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
            label = f"{v_type.upper()} {conf_pct:.0f}%"
            (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_DUPLEX, 0.5, 1)
            cv2.rectangle(annotated, (x1, max(0, y1 - th - 6)), (x1 + tw + 6, y1), color, -1)
            cv2.putText(annotated, label, (x1 + 3, y1 - 4), cv2.FONT_HERSHEY_DUPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)

        return annotated

    @staticmethod
    def draw_combined_detections(
        image: np.ndarray,
        pothole_detections: List[Dict[str, Any]],
        vehicle_detections: List[Dict[str, Any]],
        vehicle_counts: Optional[Dict[str, int]] = None,
        draw_hud: bool = True
    ) -> np.ndarray:
        """
        Draws simultaneous visual evidence of BOTH AI detection streams:
        1. Pothole detections in distinctive Amber/Red with confidence labels.
        2. Vehicle detections (Car, Motorcycle, Bus, Truck) in class-specific colors.
        3. Compact, professional AI Processing HUD banner across the top.
        """
        annotated = image.copy()
        h, w = annotated.shape[:2]

        # 1. Draw Pothole Detections (Amber/Red: BGR (30, 70, 240))
        pothole_color = (30, 70, 240)
        pothole_count = len(pothole_detections)
        for p in pothole_detections:
            bbox = p.get("bbox", {})
            if isinstance(bbox, dict):
                x1, y1, x2, y2 = bbox.get("x1", 0), bbox.get("y1", 0), bbox.get("x2", 0), bbox.get("y2", 0)
            elif isinstance(bbox, (list, tuple)) and len(bbox) == 4:
                x1, y1, x2, y2 = bbox
            else:
                continue

            conf = p.get("confidence", 0.0)
            conf_pct = conf * 100 if conf <= 1.0 else conf

            cv2.rectangle(annotated, (x1, y1), (x2, y2), pothole_color, 2)
            label = f"POTHOLE {conf_pct:.0f}%"
            (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_DUPLEX, 0.45, 1)
            cv2.rectangle(annotated, (x1, max(0, y1 - th - 6)), (x1 + tw + 6, y1), pothole_color, -1)
            cv2.putText(annotated, label, (x1 + 3, y1 - 4), cv2.FONT_HERSHEY_DUPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA)

        # 2. Draw Vehicle Detections (Car, Motorcycle, Bus, Truck)
        color_map = {
            "car": (235, 150, 50),       # Sky Blue
            "motorcycle": (40, 140, 245), # Orange
            "bus": (200, 70, 160),       # Purple
            "truck": (180, 200, 40)      # Teal
        }
        for det in vehicle_detections:
            bbox = det.get("bbox", {})
            if isinstance(bbox, dict):
                x1, y1, x2, y2 = bbox.get("x1", 0), bbox.get("y1", 0), bbox.get("x2", 0), bbox.get("y2", 0)
            elif isinstance(bbox, (list, tuple)) and len(bbox) == 4:
                x1, y1, x2, y2 = bbox
            else:
                continue

            v_type = det.get("class_name", "vehicle")
            conf = det.get("confidence", 0.0)
            conf_pct = det.get("confidence_percent", conf * 100 if conf <= 1.0 else conf)
            color = color_map.get(v_type, (200, 200, 200))

            cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
            label = f"{v_type.upper()} {conf_pct:.0f}%"
            (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_DUPLEX, 0.45, 1)
            cv2.rectangle(annotated, (x1, max(0, y1 - th - 6)), (x1 + tw + 6, y1), color, -1)
            cv2.putText(annotated, label, (x1 + 3, y1 - 4), cv2.FONT_HERSHEY_DUPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA)

        # 3. Compact Professional AI Status HUD Bar
        if draw_hud:
            counts = vehicle_counts or {
                "car": sum(1 for d in vehicle_detections if d.get("class_name") == "car"),
                "motorcycle": sum(1 for d in vehicle_detections if d.get("class_name") == "motorcycle"),
                "bus": sum(1 for d in vehicle_detections if d.get("class_name") == "bus"),
                "truck": sum(1 for d in vehicle_detections if d.get("class_name") == "truck"),
                "total": len(vehicle_detections)
            }
            total_v = counts.get("total", len(vehicle_detections))

            hud_height = 26
            overlay = annotated.copy()
            cv2.rectangle(overlay, (0, 0), (w, hud_height), (15, 15, 20), -1)
            cv2.addWeighted(overlay, 0.75, annotated, 0.25, 0, annotated)

            hud_text = (
                f"AI PROCESSING | Potholes: {pothole_count} | Vehicles: {total_v} "
                f"(Cars: {counts.get('car', 0)}, M/C: {counts.get('motorcycle', 0)}, "
                f"Buses: {counts.get('bus', 0)}, Trucks: {counts.get('truck', 0)})"
            )
            cv2.putText(annotated, hud_text, (8, 17), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (240, 240, 245), 1, cv2.LINE_AA)

        return annotated
