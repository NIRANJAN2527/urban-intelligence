"""
DRISHTIYANA - YOLOv8 Pothole Detection & Annotation Module
Loads pretrained best.pt once on startup, runs inference on enhanced frames,
filters detections with confidence >= 0.80, and renders bounding boxes with clean HUD labels.
"""

import os
import cv2
import numpy as np
from typing import List, Dict, Any, Tuple
from ultralytics import YOLO

# Pretrained model path specified by user
DEFAULT_MODEL_PATH = r"C:\Users\K.Niranjan\.cache\huggingface\hub\models--Samdutse--pothole-yolov8\snapshots\80c43b9a2ef0f5c2aed48914041bac8191351e17\best.pt"

# Minimum confidence threshold
POTHOLE_CONFIDENCE_THRESHOLD = 0.80


class PotholeDetector:
    def __init__(self, model_path: str = DEFAULT_MODEL_PATH, confidence_threshold: float = POTHOLE_CONFIDENCE_THRESHOLD):
        self.model_path = os.environ.get("POTHOLE_MODEL_PATH", model_path)
        self.confidence_threshold = confidence_threshold
        self.model = None
        self.load_model()

    def load_model(self):
        """Loads YOLO model once during startup."""
        if not os.path.exists(self.model_path):
            raise FileNotFoundError(f"Pothole YOLO model not found at specified path: {self.model_path}")

        print(f"[Detector] Loading YOLO model from: {self.model_path} ...")
        self.model = YOLO(self.model_path)
        # Warmup with dummy image to prepare model tensors in memory
        dummy = np.zeros((640, 640, 3), dtype=np.uint8)
        self.model.predict(dummy, verbose=False)
        print(f"[Detector] Model loaded successfully! Class names: {self.model.names}")

    def detect(self, frame: np.ndarray) -> Tuple[List[Dict[str, Any]], np.ndarray]:
        """
        Runs YOLO inference on the input (enhanced) frame.
        Filters detections by confidence >= threshold.
        Renders bounding boxes on a copy of the frame for accepted detections.
        
        Returns:
            (accepted_detections_list, annotated_frame)
        """
        if self.model is None or frame is None:
            return [], frame

        # Run inference (conf=0.25 on raw detector, then strictly filter >= 0.80)
        results = self.model.predict(frame, conf=0.25, verbose=False)

        accepted_detections = []
        annotated_frame = frame.copy()

        if not results or len(results) == 0:
            return accepted_detections, annotated_frame

        result = results[0]
        boxes = result.boxes

        if boxes is None or len(boxes) == 0:
            return accepted_detections, annotated_frame

        for box in boxes:
            conf = float(box.conf[0].cpu().item())
            cls_id = int(box.cls[0].cpu().item())
            class_name = self.model.names.get(cls_id, "pothole")

            # Strictly filter by confidence >= 0.80
            if conf < self.confidence_threshold:
                continue

            # Bounding box coordinates
            xyxy = box.xyxy[0].cpu().numpy()
            x1, y1, x2, y2 = int(xyxy[0]), int(xyxy[1]), int(xyxy[2]), int(xyxy[3])

            detection = {
                "class_name": class_name,
                "confidence": round(conf, 4),
                "confidence_percent": round(conf * 100, 1),
                "class_id": cls_id,
                "bbox": {
                    "x1": x1,
                    "y1": y1,
                    "x2": x2,
                    "y2": y2
                }
            }
            accepted_detections.append(detection)

            # Draw bounding box on frame
            self.draw_detection(annotated_frame, detection)

        return accepted_detections, annotated_frame

    @staticmethod
    def draw_detection(image: np.ndarray, detection: Dict[str, Any]):
        """
        Renders bounding box and badge:
        POTHOLE
        91%
        """
        bbox = detection["bbox"]
        x1, y1, x2, y2 = bbox["x1"], bbox["y1"], bbox["x2"], bbox["y2"]
        conf_pct = detection["confidence_percent"]

        # Color palette: Vibrant Emerald Green (#16A34A -> BGR: (74, 163, 22))
        box_color = (22, 163, 74)
        corner_color = (34, 197, 94)

        # Draw main bounding box
        cv2.rectangle(image, (x1, y1), (x2, y2), box_color, 3)

        # Draw corner accent brackets for high-tech HUD appearance
        corner_len = min(24, max(8, int((x2 - x1) * 0.15)))
        t = 4
        # Top-left
        cv2.line(image, (x1, y1), (x1 + corner_len, y1), corner_color, t)
        cv2.line(image, (x1, y1), (x1, y1 + corner_len), corner_color, t)
        # Top-right
        cv2.line(image, (x2, y1), (x2 - corner_len, y1), corner_color, t)
        cv2.line(image, (x2, y1), (x2, y1 + corner_len), corner_color, t)
        # Bottom-left
        cv2.line(image, (x1, y2), (x1 + corner_len, y2), corner_color, t)
        cv2.line(image, (x1, y2), (x1, y2 - corner_len), corner_color, t)
        # Bottom-right
        cv2.line(image, (x2, y2), (x2 - corner_len, y2), corner_color, t)
        cv2.line(image, (x2, y2), (x2, y2 - corner_len), corner_color, t)

        # Badge Label: "POTHOLE 91%"
        label_text = f"POTHOLE {conf_pct:.0f}%"
        font = cv2.FONT_HERSHEY_DUPLEX
        font_scale = 0.65
        thickness = 1

        (tw, th), baseline = cv2.getTextSize(label_text, font, font_scale, thickness)
        badge_y1 = max(0, y1 - th - 12)
        badge_y2 = y1
        badge_x2 = min(image.shape[1], x1 + tw + 16)

        # Label background pill
        cv2.rectangle(image, (x1, badge_y1), (badge_x2, badge_y2), (21, 128, 61), -1)
        cv2.rectangle(image, (x1, badge_y1), (badge_x2, badge_y2), corner_color, 1)

        # Label text (white)
        cv2.putText(image, label_text, (x1 + 8, badge_y2 - 6), font, font_scale, (255, 255, 255), thickness, cv2.LINE_AA)
