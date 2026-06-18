# =============================================
# Vision Assistant - Installation Guide
# Android Termux & Render.com Deployment
# Python 3.13.13 | YOLOv8n | FastAPI
# =============================================

## 📱 Prerequisites

- Android device (8.0+) for local Termux deployment
- OR a Render.com account for cloud deployment
- Android Chrome Browser (for camera access)
- 500MB+ free storage
- 2GB+ RAM recommended

---

# ☁️ OPTION A: DEPLOY ON RENDER.COM (Recommended)

Deploy to the cloud — accessible from any device, no Termux needed.

## Step A1: Push to GitHub

```bash
# Already done — your code is at:
# https://github.com/Minaty001/img-reco
```

## Step A2: Deploy on Render

### Method 1: One-Click Blueprint (Easiest)

1. Go to [Render.com Dashboard](https://dashboard.render.com)
2. Click **New → Blueprint**
3. Connect your GitHub repo (`Minaty001/img-reco`)
4. Render auto-detects `render.yaml` and configures everything
5. Click **Apply**

Deployed in ~3 minutes. Your app will be at:
```
https://vision-assistant.onrender.com
```

### Method 2: Manual Web Service

1. Go to [Render.com Dashboard](https://dashboard.render.com)
2. Click **New → Web Service**
3. Connect your GitHub repo (`Minaty001/img-reco`)
4. Configure:
   - **Name**: `vision-assistant`
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn app:app --host 0.0.0.0 --port $PORT`
   - **Plan**: Free
5. Click **Create Web Service**

## Step A3: Important — First Load is Slow

The first request will take **30–60 seconds** because Render downloads the YOLOv8n model (~6 MB) and loads it into memory. Subsequent requests will be fast.

## Step A4: Camera Access via HTTPS

Since Render provides HTTPS, the camera works automatically in Chrome — no flags needed.
Just open your Render URL and tap **Start Detection**.

## Step A5: Keep Free Plan Alive

Render free plan spins down after 15 min of inactivity. To keep it warm:
- Use [cron-job.org](https://cron-job.org) to ping `/health` every 10 minutes
- Or just reload the page before using

---

# 📱 OPTION B: DEPLOY ON ANDROID TERMUX

## Step B1: Termux Setup

```bash
# Update packages
pkg update && pkg upgrade -y

# Install essential packages
pkg install -y python clang python-pip cmake ninja rust binutils openssl git

# Verify Python version (must be 3.13.x)
python --version
```

## Step B2: Install Python Dependencies

```bash
# Navigate to project directory
cd img-reco

# Create virtual environment (recommended)
python -m venv venv
source venv/bin/activate

# Upgrade pip
pip install --upgrade pip

# Install PyTorch for Termux (ARM CPU-only)
pip install torch --index-url https://download.pytorch.org/whl/cpu

# Install remaining dependencies
pip install -r requirements.txt
```

## ⚠️ Step B3: If Ultralytics Installation Fails on Termux

### Fallback A: Install from source with build flags

```bash
# Set build flags for ARM
export GRPC_PYTHON_BUILD_SYSTEM_OPENSSL=1
export BLIS_ARCH=generic

pip install ultralytics
```

### Fallback B: Use Termux native packages

```bash
# Install pre-built packages via pkg
pkg install -y python-numpy python-pillow

# Then try pip again
pip install ultralytics
```

## Step B4: Model Download

```bash
# Pre-download the model (optional, auto-downloads on first run anyway)
python -c "from ultralytics import YOLO; YOLO('yolov8n.pt')"
```

## Step B5: Start the Server

```bash
# Activate venv if not already
source venv/bin/activate

# Run the app
python app.py
# OR
uvicorn app:app --host 0.0.0.0 --port 2009
```

## Step B6: Open in Browser

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

## Step B7: Camera Permissions in Chrome

Since Termux serves HTTP (not HTTPS), Chrome may block the camera. Fix it:

1. Type `chrome://flags/#unsafely-treat-insecure-origin-as-secure` in Chrome
2. Add `http://localhost:2009` to the list
3. Set to **Enabled**
4. Relaunch Chrome

---

# 🛠️ Troubleshooting

## Render.com Issues

| Problem | Solution |
|---------|----------|
| Build fails with torch error | Switch to Free plan; CPU-only torch is fine |
| App crashes on first request | Allow 60s for model download; check logs |
| 502 Bad Gateway | Increase health check timeout to 120s in Render dashboard |
| Slow detection (>5s per frame) | Free plan has limited CPU; normal for YOLO on free tier |
| Camera not working | Must use HTTPS (Render provides this automatically) |

## Termux Issues

| Problem | Solution |
|---------|----------|
| ModuleNotFoundError: No module named 'torch' | `pip install torch --index-url https://download.pytorch.org/whl/cpu` |
| libomp.so not found | `pkg install -y libomp` |
| Camera not working in Chrome | Follow Step B7 above |
| Low FPS | Close background apps; increase FRAME_INTERVAL in script.js |
| Address already in use | `fuser -k 2009/tcp` or `pkill -f uvicorn` |
| Memory error loading model | Add `model.to('cpu').half()` in app.py |
| pip externally-managed-environment | Use venv or add `--break-system-packages` |

---

# 📁 Project Structure

```
img-reco/
├── app.py              # FastAPI backend
├── requirements.txt    # Python dependencies
├── Procfile            # Render.com start command
├── render.yaml         # Render Blueprint config
├── runtime.txt         # Python version for Render
├── INSTALL.md          # This file
├── .gitignore
├── models/
│   └── yolov8n.pt      # YOLO model (auto-downloaded)
├── templates/
│   └── index.html      # Frontend UI
├── static/
│   ├── style.css       # Dark theme styles
│   └── script.js       # Frontend logic
└── uploads/            # Temp uploads (auto-created)
```

---

# ✅ Verification

After successful deployment (either option):

1. Open the app URL in Chrome
2. Health check: `<your-url>/health` returns `{"status":"ok"}`
3. Tap **Start Detection**
4. Allow camera permission
5. Objects detected — names and confidence shown
6. Voice feedback in English / Hindi (toggle with 🌐 button)

---

# 🔮 Future Modules (Architecture Ready)

The code is designed so these modules can be added cleanly:

- **Face Recognition** — InsightFace module
- **OCR** — PaddleOCR / Tesseract
- **QR/Barcode Scanner** — pyzbar
- **Currency Recognition** — Custom classifier
- **Scene Understanding** — CLIP / BLIP
- **Object Tracking** — ByteTrack / BoT-SORT
- **Person Tracking** — ReID model
- **Voice Commands** — Web Speech Recognition
- **Memory System** — Store detection history across sessions

Each plugs in as a new endpoint in `app.py` with isolated logic.
