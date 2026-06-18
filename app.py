"""
============================================
Vision Assistant - Real-time AI Vision WebApp
============================================
FastAPI Backend with YOLOv8n Object Detection
Supports English & Hindi voice feedback
Designed for Android Termux (Python 3.13.13)
============================================

Future-ready architecture:
  - InsightFace / Face Recognition
  - OCR / QR Scanner
  - Currency Recognition
  - Scene Understanding
  - Jarvis Voice Commands
  - Memory System
  - Object Tracking / Person Tracking
"""

import os
import sys
import time
import json
import logging
from pathlib import Path
from io import BytesIO
from collections import Counter
from typing import List

from fastapi import FastAPI, File, UploadFile, Response
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image
import numpy as np
import torch
import uvicorn
from contextlib import asynccontextmanager

# ------------------------------------------------------------------
# Logging setup
# ------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("vision-assistant")

# ------------------------------------------------------------------
# Constants & Configuration
# ------------------------------------------------------------------
MODEL_PATH = Path("models/yolov8n.pt")
MODEL_PATH.parent.mkdir(exist_ok=True)  # Ensure models/ directory exists
CONFIDENCE_THRESHOLD = 0.40  # Minimum confidence for detections
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

# Render.com assigns a dynamic port via $PORT env variable
PORT = int(os.environ.get("PORT", 2009))
HOST = os.environ.get("HOST", "0.0.0.0")

# ------------------------------------------------------------------
# YOLO Model Loader (lazy load on first request)
# ------------------------------------------------------------------
_model = None


def get_model():
    """Lazy-load the YOLOv8 model to reduce startup time."""
    global _model
    if _model is None:
        logger.info("Loading YOLOv8n model...")
        try:
            from ultralytics import YOLO
            _model = YOLO(str(MODEL_PATH))
            logger.info("YOLOv8n model loaded successfully.")
        except Exception as e:
            logger.error(f"Failed to load YOLO model: {e}")
            raise
    return _model


# ------------------------------------------------------------------
# Lifespan context manager (must be defined before FastAPI construction)
# ------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Suppress noisy httptools invalid-request warnings on startup."""
    logging.getLogger("httptools").setLevel(logging.ERROR)
    yield


# ------------------------------------------------------------------
# FastAPI Application
# ------------------------------------------------------------------
app = FastAPI(
    title="Vision Assistant",
    description="Real-time AI Vision Assistant with Voice Feedback",
    version="1.0.0",
    lifespan=lifespan,
)

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Path to the main HTML template
TEMPLATES_DIR = Path("templates")
TEMPLATES_DIR.mkdir(exist_ok=True)


# ------------------------------------------------------------------
# Smart Description Engine
#   Converts detection results into natural language
#   Supports English and Hindi
# ------------------------------------------------------------------
# COCO class names that YOLOv8n detects (commonly used subset)
COCO_COMMON = {
    0: "person", 1: "bicycle", 2: "car", 3: "motorcycle", 4: "airplane",
    5: "bus", 6: "train", 7: "truck", 8: "boat", 9: "traffic light",
    10: "fire hydrant", 11: "stop sign", 12: "parking meter", 13: "bench",
    14: "bird", 15: "cat", 16: "dog", 17: "horse", 18: "sheep", 19: "cow",
    20: "elephant", 21: "bear", 22: "zebra", 23: "giraffe", 24: "backpack",
    25: "umbrella", 26: "handbag", 27: "tie", 28: "suitcase", 29: "frisbee",
    30: "skis", 31: "snowboard", 32: "sports ball", 33: "kite", 34: "baseball bat",
    35: "baseball glove", 36: "skateboard", 37: "surfboard", 38: "tennis racket",
    39: "bottle", 40: "wine glass", 41: "cup", 42: "fork", 43: "knife",
    44: "spoon", 45: "bowl", 46: "banana", 47: "apple", 48: "sandwich",
    49: "orange", 50: "broccoli", 51: "carrot", 52: "hot dog", 53: "pizza",
    54: "donut", 55: "cake", 56: "chair", 57: "couch", 58: "potted plant",
    59: "bed", 60: "dining table", 61: "toilet", 62: "tv", 63: "laptop",
    64: "mouse", 65: "remote", 66: "keyboard", 67: "cell phone",
    68: "microwave", 69: "oven", 70: "toaster", 71: "sink", 72: "refrigerator",
    73: "book", 74: "clock", 75: "vase", 76: "scissors", 77: "teddy bear",
    78: "hair drier", 79: "toothbrush",
}

# Hindi translations for common objects
HINDI_NAMES = {
    "person": "vyakti",
    "bicycle": "saikil",
    "car": "gaadi",
    "motorcycle": "motor saikil",
    "airplane": "viman",
    "bus": "bas",
    "train": "train",
    "truck": "truck",
    "boat": "nauka",
    "bird": "chidiya",
    "cat": "billi",
    "dog": "kutta",
    "horse": "ghoda",
    "sheep": "bhed",
    "cow": "gai",
    "elephant": "haathi",
    "bear": "bhalu",
    "zebra": "zebra",
    "giraffe": "jiraf",
    "backpack": "basta",
    "umbrella": "chhatri",
    "handbag": "baila",
    "tie": "tai",
    "suitcase": "sutkes",
    "frisbee": "frisbee",
    "bottle": "botal",
    "wine glass": "sharab ka glass",
    "cup": "pyala",
    "fork": "kanta",
    "knife": "chaku",
    "spoon": "chammach",
    "bowl": "katori",
    "banana": "kela",
    "apple": "seb",
    "sandwich": "sandwich",
    "orange": "santra",
    "broccoli": "broccoli",
    "carrot": "gajar",
    "pizza": "pizza",
    "donut": "donut",
    "cake": "cake",
    "chair": "kursi",
    "couch": "sofa",
    "potted plant": "gamle ka podha",
    "bed": "bistar",
    "dining table": "khaane ki mez",
    "toilet": "shauchalay",
    "tv": "tv",
    "laptop": "laptop",
    "mouse": "mouse",
    "remote": "remote",
    "keyboard": "keyboard",
    "cell phone": "mobile phone",
    "book": "kitab",
    "clock": "ghadi",
    "vase": "phooldan",
    "teddy bear": "teddy bear",
    "toothbrush": "daant ka brush",
    "microwave": "microwave",
    "oven": "oven",
    "refrigerator": "fridge",
}


def generate_description(objects: List[dict], language: str = "en") -> str:
    """
    Convert detection results into a natural language sentence.

    Args:
        objects: List of detected objects with 'name' key.
        language: "en" for English, "hi" for Hindi.

    Returns:
        A human-readable description string.
    """
    if not objects:
        if language == "hi":
            return "Koi vastu nahi dikh rahi hai."
        return "I cannot see any objects."

    # Count occurrences of each object name
    name_counts = Counter(obj["name"] for obj in objects)

    parts = []
    for name, count in name_counts.items():
        if language == "hi":
            display_name = HINDI_NAMES.get(name, name)
            if count == 1:
                # Use "ek" for one
                parts.append(f"ek {display_name}")
            else:
                # Plural: add "log" suffix for persons
                if name == "person":
                    parts.append(f"{count} {display_name}on")
                else:
                    parts.append(f"{count} {display_name}")
        else:
            display_name = name
            if count == 1:
                article = "an" if display_name[0] in "aeiou" else "a"
                parts.append(f"{article} {display_name}")
            else:
                # Simple plural
                if display_name.endswith("s"):
                    parts.append(f"{count} {display_name}")
                elif display_name == "person":
                    parts.append(f"{count} people")
                else:
                    parts.append(f"{count} {display_name}s")

    # Join parts with commas and "and"
    if len(parts) == 1:
        result = parts[0]
    elif len(parts) == 2:
        if language == "hi":
            result = f"{parts[0]} aur {parts[1]}"
        else:
            result = f"{parts[0]} and {parts[1]}"
    else:
        if language == "hi":
            result = ", ".join(parts[:-1]) + f" aur {parts[-1]}"
        else:
            result = ", ".join(parts[:-1]) + f", and {parts[-1]}"

    if language == "hi":
        return f"Mujhe {result} dikh raha hai."
    return f"I can see {result}."


# ------------------------------------------------------------------
# Core Detection Function
# ------------------------------------------------------------------
def run_detection(image_bytes: bytes) -> dict:
    """
    Run YOLOv8n detection on image bytes.

    Args:
        image_bytes: Raw image data (JPEG/PNG).

    Returns:
        Dict with 'objects', 'description_en', 'description_hi'.
    """
    try:
        model = get_model()

        # Open image with Pillow (wrap bytes in BytesIO)
        img = Image.open(BytesIO(image_bytes))
        # Convert RGBA to RGB if needed
        if img.mode == "RGBA":
            img = img.convert("RGB")

        # Run inference (no training mode, half precision for speed on GPU)
        results = model(img, verbose=False, half=torch.cuda.is_available())[0]

        # Parse detections
        objects = []
        if results.boxes is not None:
            for box in results.boxes:
                conf = float(box.conf[0])
                cls_id = int(box.cls[0])
                if conf >= CONFIDENCE_THRESHOLD:
                    name = COCO_COMMON.get(cls_id, f"class_{cls_id}")
                    objects.append({
                        "name": name,
                        "confidence": round(conf, 2),
                    })

        # Generate descriptions
        description_en = generate_description(objects, "en")
        description_hi = generate_description(objects, "hi")

        return {
            "objects": objects,
            "description_en": description_en,
            "description_hi": description_hi,
        }

    except Exception as e:
        logger.error(f"Detection error: {e}")
        return {
            "objects": [],
            "description_en": "Detection error occurred.",
            "description_hi": "Detect mein error aaya hai.",
        }


# ------------------------------------------------------------------
# API Endpoints
# ------------------------------------------------------------------

@app.get("/", response_class=HTMLResponse)
async def index():
    """Serve the main UI (read HTML directly — avoids Jinja2/Python 3.14 compat issues)."""
    html_path = TEMPLATES_DIR / "index.html"
    if not html_path.exists():
        return HTMLResponse("<h1>index.html not found</h1>", status_code=404)
    html_content = html_path.read_text(encoding="utf-8")
    return HTMLResponse(content=html_content)


@app.get("/favicon.ico", response_class=HTMLResponse)
async def favicon():
    """Return an inline SVG favicon to prevent 404 errors."""
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
        '<rect width="64" height="64" rx="12" fill="#39d2c0"/>'
        '<text x="32" y="44" font-size="36" text-anchor="middle" fill="#000" font-weight="bold">V</text>'
        "</svg>"
    )
    return Response(content=svg, media_type="image/svg+xml")


@app.post("/detect")
async def detect(file: UploadFile = File(...)):
    """
    Receive an image frame, run YOLO detection, return JSON.

    Expected input: multipart form with field 'file' containing image.
    """
    image_bytes = await file.read()
    result = run_detection(image_bytes)
    return JSONResponse(content=result)


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok", "model_loaded": _model is not None}


# Catch unmatched routes to avoid noisy error logs from browser probes
@app.api_route("/{path_name:path}", methods=["GET", "POST", "OPTIONS", "HEAD"], include_in_schema=False)
async def catch_all(path_name: str):
    """Return 204 for arbitrary browser probes (e.g., favicon fallbacks, preconnects)."""
    return Response(status_code=204)


# ------------------------------------------------------------------
# Entry Point
# ------------------------------------------------------------------
if __name__ == "__main__":
    print("=" * 50)
    print("  Vision Assistant - AI Vision WebApp")
    print(f"  Running on: http://{HOST}:{PORT}")
    print("=" * 50)
    uvicorn.run(
        "app:app",
        host=HOST,
        port=PORT,
        reload=False,
        log_level="info",
    )
