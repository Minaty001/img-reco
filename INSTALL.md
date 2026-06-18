# =============================================
# Vision Assistant - Installation Guide
# Android Termux Deployment
# Python 3.13.13 | YOLOv8n | FastAPI
# =============================================

## 📱 Prerequisites

- Android device (8.0+ recommended)
- [Termux](https://f-droid.org/repo/com.termux_118.apk) (F-Droid version recommended)
- Termux:API (for permissions)
- Android Chrome Browser
- 500MB+ free storage
- 2GB+ RAM recommended

---

## 🔧 Step 1: Termux Setup

```bash
# Update packages
pkg update && pkg upgrade -y

# Install essential packages
pkg install -y python clang python-pip cmake ninja rust binutils openssl git

# Verify Python version (must be 3.13.x)
python --version
```

---

## 🔧 Step 2: Install Python Dependencies

```bash
# Navigate to project directory
cd vision-assistant

# Create virtual environment (recommended)
python -m venv venv
source venv/bin/activate

# Install core dependencies (one by one for troubleshooting)
pip install --upgrade pip

# Install PyTorch for Termux (ARM)
# IMPORTANT: Use the Termux-compatible PyTorch
pkg install -y python-numpy

# Try installing ultralytics (may take 5-10 minutes on phone)
pip install fastapi uvicorn[standard] pillow python-multipart numpy

# Try installing ultralytics
pip install ultralytics
```

---

## ⚠️ Step 3: If Ultralytics Installation Fails

Termux on ARM can have issues with pre-built wheels. Try these fallbacks:

### Fallback A: Install from source with build flags

```bash
# Set build flags for ARM (32-bit)
export GRPC_PYTHON_BUILD_SYSTEM_OPENSSL=1
export BLIS_ARCH=generic

# Install PyTorch first (CPU-only for Termux)
pip install torch --index-url https://download.pytorch.org/whl/cpu

# Then try ultralytics
pip install ultralytics
```

### Fallback B: Manual ONNX + OpenCV

```bash
# If ultralytics still fails, install components manually
pip install onnx onnxruntime numpy pillow

# Install OpenCV for Termux
pkg install -y opencv-python

# For YOLO inference in pure ONNX format:
# (See app_fallback.py for alternative implementation)
```

### Fallback C: Use Termux's native Python packages

```bash
# Termux has some pre-built packages
pkg install -y python-numpy python-pillow

# Then try pip again
pip install ultralytics
```

---

## 🔧 Step 4: Model Download

```bash
# The model will auto-download on first run
# Or pre-download it:
python -c "from ultralytics import YOLO; YOLO('yolov8n.pt')"
```

---

## 🚀 Step 5: Start the Server

```bash
# Activate venv if not already
source venv/bin/activate

# Run the app (from vision-assistant/ directory)
python app.py
# OR
uvicorn app:app --host 0.0.0.0 --port 2009
```

---

## 🌐 Step 6: Open in Browser

Open **Android Chrome** and navigate to:

```
http://localhost:2009
```

Or from another device on same network:

```
http://<phone-ip>:2009
```

Find your phone's IP:
```bash
ifconfig | grep inet
# or
ip addr show
```

---

## 📸 Camera Permissions

1. When Chrome asks for **Camera permission**, tap "Allow"
2. If using HTTP (not HTTPS) on localhost, Chrome may block camera
   - Solution: Type `chrome://flags/#unsafely-treat-insecure-origin-as-secure`
   - Add `http://localhost:2009` to the list
   - Relaunch Chrome

---

## 🛠️ Troubleshooting

### Problem: "ModuleNotFoundError: No module named 'torch'"

```bash
# Install PyTorch CPU-only
pip install torch --index-url https://download.pytorch.org/whl/cpu
```

### Problem: "libomp.so not found" or OpenMP errors

```bash
pkg install -y libomp
```

### Problem: Camera not working in Chrome

```
1. Type chrome://flags/#unsafely-treat-insecure-origin-as-secure
2. Add http://localhost:2009
3. Set to "Enabled"
4. Restart Chrome
```

### Problem: Low FPS / Lag

- Close background apps
- Reduce canvas size in script.js (change 640 to 320)
- Increase FRAME_INTERVAL in script.js (change 400 to 600)

### Problem: "Address already in use"

```bash
# Kill process on port 2009
fuser -k 2009/tcp
# or
pkill -f uvicorn
```

### Problem: Memory error loading model

```bash
# Use half precision loading
# Edit app.py: add model.to('cpu').half() after loading
```

### Problem: pip install fails with "error: externally-managed-environment"

```bash
# Use venv (already shown above)
# Or install with --break-system-packages
pip install ultralytics --break-system-packages
```

---

## 📋 Quick Start Commands (Copy-Paste)

```bash
# Complete setup (run one by one)
cd ~
pkg update && pkg upgrade -y
pkg install -y python clang python-pip cmake ninja rust binutils openssl git

# Clone or copy project, then:
cd vision-assistant
python -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install fastapi uvicorn[standard] pillow python-multipart numpy
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install ultralytics

# Run
python app.py
```

---

## 📁 Project Structure

```
vision-assistant/
├── app.py              # FastAPI backend
├── requirements.txt    # Python dependencies
├── INSTALL.md          # This file
├── models/
│   └── yolov8n.pt      # YOLO model (auto-downloaded)
├── templates/
│   └── index.html      # Frontend UI
├── static/
│   ├── style.css       # Styles
│   └── script.js       # Frontend logic
└── uploads/            # Temp uploads (auto-created)
```

---

## ✅ Verification

After successful setup:

1. Server runs on `http://0.0.0.0:2009`
2. Health check: `http://localhost:2009/health` returns `{"status":"ok"}`
3. Camera opens in Chrome
4. Objects detected with bounding boxes (displayed as chips)
5. Voice feedback in English/Hindi

---

## 🔮 Future Modules (Extendable)

This architecture supports adding:

- **Face Recognition** (InsightFace)
- **OCR** (PaddleOCR / Tesseract)
- **QR/Barcode Scanner**
- **Currency Recognition**
- **Scene Understanding**
- **Object Tracking**
- **Person Tracking**
- **Voice Commands**
- **Memory System**

Each can be added as a new module in `app.py` with its own endpoint.
