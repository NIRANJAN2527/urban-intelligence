"""
DRISHTIYANA - Edge AI Image Enhancement Module
OpenCV Image Preprocessing Pipeline for Road Surface & Pothole Detection:
1. Brightness Correction (Auto-Gamma / Luminosity normalization)
2. CLAHE (Contrast Limited Adaptive Histogram Equalization on L-channel)
3. Sharpening (Edge emphasis for asphalt texture & pothole contours)
"""

import cv2
import numpy as np

# Configurable toggles
ENABLE_BRIGHTNESS_CORRECTION = True
ENABLE_CLAHE = True
ENABLE_SHARPENING = True

# Sharpening kernel (unsharp contrast emphasis)
SHARPEN_KERNEL = np.array([
    [0, -1, 0],
    [-1, 5, -1],
    [0, -1, 0]
], dtype=np.float32)


def correct_brightness(frame: np.ndarray) -> np.ndarray:
    """
    Adjusts illumination using adaptive gamma correction.
    Lifts dark asphalt in shadowed areas without blowing out bright highlights.
    """
    if not ENABLE_BRIGHTNESS_CORRECTION or frame is None:
        return frame

    # Convert to grayscale to evaluate overall scene luminance
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    mean_val = np.mean(gray)

    # If already well-balanced (mean luminance around 110-145), return original
    if 105.0 <= mean_val <= 150.0:
        return frame

    # Target mid-tone luminance ~128
    # gamma < 1.0 brightens dark scenes; gamma > 1.0 darkens washed-out scenes
    gamma = np.clip(np.log(128.0 / 255.0) / np.log(max(mean_val, 10.0) / 255.0), 0.6, 1.8)

    inv_gamma = 1.0 / gamma
    lut = np.array([((i / 255.0) ** inv_gamma) * 255 for i in range(256)], dtype=np.uint8)
    return cv2.LUT(frame, lut)


def apply_clahe(frame: np.ndarray, clip_limit: float = 2.2, tile_grid_size: tuple = (8, 8)) -> np.ndarray:
    """
    Applies Contrast Limited Adaptive Histogram Equalization (CLAHE) on the L-channel
    in LAB color space. Enhances pothole edges, cracks, and road depressions.
    """
    if not ENABLE_CLAHE or frame is None:
        return frame

    lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
    l_channel, a_channel, b_channel = cv2.split(lab)

    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=tile_grid_size)
    l_enhanced = clahe.apply(l_channel)

    lab_enhanced = cv2.merge((l_enhanced, a_channel, b_channel))
    return cv2.cvtColor(lab_enhanced, cv2.COLOR_LAB2BGR)


def sharpen_frame(frame: np.ndarray) -> np.ndarray:
    """
    Applies an unsharp filter kernel to sharpen road surface edges and pothole boundaries.
    """
    if not ENABLE_SHARPENING or frame is None:
        return frame

    # Filter2D with unsharp kernel
    sharpened = cv2.filter2D(frame, -1, SHARPEN_KERNEL)
    # Blend slightly with original to avoid harsh high-frequency noise
    return cv2.addWeighted(frame, 0.25, sharpened, 0.75, 0)


def enhance_frame(frame: np.ndarray) -> np.ndarray:
    """
    Executes the full modular OpenCV preprocessing pipeline:
    FRAME -> Brightness Correction -> CLAHE -> Sharpening -> ENHANCED FRAME
    """
    if frame is None:
        return None

    step1 = correct_brightness(frame)
    step2 = apply_clahe(step1)
    step3 = sharpen_frame(step2)
    return step3
