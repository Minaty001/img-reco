/**
 * =============================================
 * Vision Assistant - Frontend JavaScript
 * =============================================
 * Camera capture, detection, voice feedback
 * English & Hindi SpeechSynthesis
 * Smart speaking logic
 * Designed for Android Chrome
 * =============================================
 */

(function () {
    "use strict";

    // ---------------------------------------------------------------
    // DOM References
    // ---------------------------------------------------------------
    const video = document.getElementById("video");
    const canvas = document.getElementById("canvas");
    const videoOverlay = document.getElementById("videoOverlay");
    const startBtn = document.getElementById("startBtn");
    const stopBtn = document.getElementById("stopBtn");
    const toggleLang = document.getElementById("toggleLang");
    const langLabel = document.getElementById("langLabel");
    const statusText = document.getElementById("statusText");
    const statusDot = document.getElementById("statusDot");
    const statusBar = document.querySelector(".status-bar");
    const objectsList = document.getElementById("objectsList");
    const objectCount = document.getElementById("objectCount");
    const speechText = document.getElementById("speechText");
    const fpsDisplay = document.getElementById("fpsDisplay");
    const currentObjectsSpan = document.getElementById("currentObjects");
    const previousObjectsSpan = document.getElementById("previousObjects");
    const lastSpokenSpan = document.getElementById("lastSpoken");

    // ---------------------------------------------------------------
    // State
    // ---------------------------------------------------------------
    let isDetecting = false;
    let isSpeaking = false;
    let language = "en"; // "en" or "hi"
    let stream = null;
    let animationFrameId = null;
    let detectionInterval = null;

    // Detection state for smart speaking logic
    let prevObjectNames = new Set();
    let prevObjectCounts = {};
    let lastSpokenMessage = "";
    let frameCount = 0;

    // Performance
    let lastFrameTime = 0;
    const FRAME_INTERVAL = 400; // ms between frames (~2.5 FPS)
    let fpsHistory = [];

    // ---------------------------------------------------------------
    // Speak using Browser SpeechSynthesis API
    // ---------------------------------------------------------------
    function speak(text, lang) {
        if (!text || isSpeaking) return;

        // Cancel any ongoing speech
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang === "hi" ? "hi-IN" : "en-US";
        utterance.rate = 0.95;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        // Try to find a matching voice
        utterance.onstart = function () {
            isSpeaking = true;
        };

        utterance.onend = function () {
            isSpeaking = false;
        };

        utterance.onerror = function () {
            isSpeaking = false;
        };

        // For Hindi, try to find a Hindi voice
        if (lang === "hi") {
            const voices = window.speechSynthesis.getVoices();
            const hindiVoice = voices.find(
                (v) => v.lang.startsWith("hi") || v.lang.startsWith("hin")
            );
            if (hindiVoice) utterance.voice = hindiVoice;
        }

        window.speechSynthesis.speak(utterance);
    }

    // ---------------------------------------------------------------
    // Smart Speaking Logic - Decide if we should speak
    // ---------------------------------------------------------------
    function shouldSpeak(objects) {
        const currentNames = new Set(objects.map((o) => o.name));
        const currentCounts = {};
        objects.forEach((o) => {
            currentCounts[o.name] = (currentCounts[o.name] || 0) + 1;
        });

        let should = false;

        if (frameCount === 0) {
            // First detection - speak
            should = true;
        } else {
            // New object appeared
            for (let name of currentNames) {
                if (!prevObjectNames.has(name)) {
                    should = true;
                    break;
                }
            }

            // Object disappeared
            if (!should) {
                for (let name of prevObjectNames) {
                    if (!currentNames.has(name)) {
                        should = true;
                        break;
                    }
                }
            }

            // Count changed
            if (!should) {
                for (let name of currentNames) {
                    if (currentCounts[name] !== prevObjectCounts[name]) {
                        should = true;
                        break;
                    }
                }
            }
        }

        // Update state
        prevObjectNames = currentNames;
        prevObjectCounts = currentCounts;
        frameCount++;

        return should;
    }

    // ---------------------------------------------------------------
    // Update UI with Detection Results
    // ---------------------------------------------------------------
    function updateUI(data) {
        const objects = data.objects || [];
        const descEn = data.description_en || "";
        const descHi = data.description_hi || "";
        const shouldSpeakResult = data.should_speak !== undefined ? data.should_speak : true;
        const history = data.history || {};

        // --- Objects List ---
        if (objects.length === 0) {
            objectsList.innerHTML =
                '<div class="empty-state">No objects detected.</div>';
            objectCount.textContent = "0";
        } else {
            let html = '<div class="objects-grid">';
            objects.forEach((obj) => {
                const confPercent = Math.round(obj.confidence * 100);
                html += `<div class="object-chip">
                            <span class="obj-name">${escapeHtml(obj.name)}</span>
                            <span class="conf">${confPercent}%</span>
                         </div>`;
            });
            html += "</div>";
            objectsList.innerHTML = html;
            objectCount.textContent = objects.length;
        }

        // --- Detection History ---
        if (history.current_objects && history.current_objects.length > 0) {
            currentObjectsSpan.textContent = history.current_objects
                .map((o) => o.name)
                .join(", ");
        } else {
            currentObjectsSpan.textContent = "-";
        }

        if (history.previous_objects && history.previous_objects.length > 0) {
            previousObjectsSpan.textContent = history.previous_objects
                .map((o) => o.name)
                .join(", ");
        } else {
            previousObjectsSpan.textContent = "-";
        }

        if (history.last_spoken) {
            lastSpokenSpan.textContent = history.last_spoken;
        }

        // --- Speech Box ---
        const displayText = language === "hi" ? descHi : descEn;
        speechText.textContent = displayText || "Waiting for detections...";

        // --- Smart Speaking ---
        const shouldSpeakLocal = shouldSpeak(objects);

        if (shouldSpeakLocal && objects.length > 0) {
            const message = language === "hi" ? descHi : descEn;
            if (message && message !== lastSpokenMessage) {
                lastSpokenMessage = message;
                speak(message, language);
            }
        }

        // If nothing detected and we had something before, speak once
        if (objects.length === 0 && prevObjectNames.size > 0) {
            const emptyMsg =
                language === "hi"
                    ? "Koi vastu nahi dikh rahi hai."
                    : "No objects detected.";
            if (emptyMsg !== lastSpokenMessage) {
                lastSpokenMessage = emptyMsg;
                speak(emptyMsg, language);
            }
        }
    }

    // ---------------------------------------------------------------
    // Send Frame to Backend for Detection
    // ---------------------------------------------------------------
    async function sendFrame() {
        if (!isDetecting) return;

        const now = performance.now();
        const elapsed = now - lastFrameTime;
        if (elapsed < FRAME_INTERVAL) return;
        lastFrameTime = now;

        try {
            // Draw video frame to canvas
            canvas.width = video.videoWidth || 640;
            canvas.height = video.videoHeight || 480;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            // Convert to blob
            const blob = await new Promise((resolve) =>
                canvas.toBlob(resolve, "image/jpeg", 0.7)
            );
            if (!blob) return;

            // Send to backend
            const formData = new FormData();
            formData.append("file", blob, "frame.jpg");

            const response = await fetch("/detect", {
                method: "POST",
                body: formData,
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            updateUI(data);

            // FPS tracking
            const frameTime = performance.now() - now;
            fpsHistory.push(frameTime);
            if (fpsHistory.length > 30) fpsHistory.shift();
            const avgFps =
                fpsHistory.length > 0
                    ? (1000 / (fpsHistory.reduce((a, b) => a + b, 0) / fpsHistory.length)).toFixed(1)
                    : "0";
            fpsDisplay.textContent = `FPS: ${avgFps}`;

            // Update status
            setStatus("active", "Detecting...");
        } catch (err) {
            console.error("Detection error:", err);
            setStatus("error", "Detection error. Retrying...");
        }
    }

    // ---------------------------------------------------------------
    // Camera Management
    // ---------------------------------------------------------------
    async function startCamera() {
        try {
            // Constraints optimized for mobile
            const constraints = {
                video: {
                    facingMode: "environment", // Rear camera on mobile
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                },
                audio: false,
            };

            stream = await navigator.mediaDevices.getUserMedia(constraints);
            video.srcObject = stream;
            videoOverlay.classList.add("hidden");

            return true;
        } catch (err) {
            console.error("Camera error:", err);
            // Try without facingMode as fallback
            try {
                const constraints = { video: true, audio: false };
                stream = await navigator.mediaDevices.getUserMedia(constraints);
                video.srcObject = stream;
                videoOverlay.classList.add("hidden");
                return true;
            } catch (err2) {
                console.error("Fallback camera error:", err2);
                setStatus("error", "Camera access denied. Allow camera permission.");
                return false;
            }
        }
    }

    function stopCamera() {
        if (stream) {
            stream.getTracks().forEach((track) => track.stop());
            stream = null;
        }
        video.srcObject = null;
        videoOverlay.classList.remove("hidden");
    }

    // ---------------------------------------------------------------
    // Start / Stop Detection
    // ---------------------------------------------------------------
    function startDetection() {
        if (isDetecting) return;

        startCamera().then((success) => {
            if (!success) return;

            isDetecting = true;
            startBtn.disabled = true;
            stopBtn.disabled = false;
            statusBar.classList.add("detecting");
            setStatus("active", "Starting detection...");
            prevObjectNames = new Set();
            prevObjectCounts = {};
            lastSpokenMessage = "";
            frameCount = 0;
            fpsHistory = [];

            // Start detection loop at reduced FPS
            detectionInterval = setInterval(sendFrame, FRAME_INTERVAL);

            // Also try to send immediately
            setTimeout(sendFrame, 200);
        });
    }

    function stopDetection() {
        isDetecting = false;
        startBtn.disabled = false;
        stopBtn.disabled = true;
        statusBar.classList.remove("detecting");
        setStatus("idle", "Stopped");

        if (detectionInterval) {
            clearInterval(detectionInterval);
            detectionInterval = null;
        }

        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }

        stopCamera();

        // Cancel any speech
        window.speechSynthesis.cancel();
        isSpeaking = false;

        fpsDisplay.textContent = "FPS: 0";
    }

    // ---------------------------------------------------------------
    // Language Toggle
    // ---------------------------------------------------------------
    function toggleLanguage() {
        language = language === "en" ? "hi" : "en";
        langLabel.textContent = language === "en" ? "English" : "हिन्दी";

        // Update speech box with current description in new language
        // If we have a last message, re-speak it in the new language
        if (lastSpokenMessage && lastSpokenMessage.includes("I can see") || lastSpokenMessage.includes("Mujhe")) {
            // We'll let the next detection cycle handle it
        }

        // Show toast-like feedback
        const feedback = language === "en" ? "Language: English" : "भाषा: हिन्दी";
        setStatus("active", feedback, 1500);
    }

    // ---------------------------------------------------------------
    // Utility Functions
    // ---------------------------------------------------------------
    function escapeHtml(text) {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }

    function setStatus(type, message, timeout) {
        statusDot.className = "status-dot";
        if (type === "active") {
            statusDot.classList.add("active");
        } else if (type === "error") {
            statusDot.classList.add("error");
        }
        statusText.textContent = message;

        if (timeout) {
            setTimeout(() => {
                if (!isDetecting) {
                    statusDot.className = "status-dot";
                    statusText.textContent = "Ready";
                }
            }, timeout);
        }
    }

    // ---------------------------------------------------------------
    // Load voices (some browsers load async)
    // ---------------------------------------------------------------
    function loadVoices() {
        window.speechSynthesis.getVoices(); // Trigger loading
    }
    window.speechSynthesis.onvoiceschanged = loadVoices;
    loadVoices();

    // ---------------------------------------------------------------
    // Event Listeners
    // ---------------------------------------------------------------
    startBtn.addEventListener("click", startDetection);
    stopBtn.addEventListener("click", stopDetection);
    toggleLang.addEventListener("click", toggleLanguage);

    // Handle page visibility (pause when not visible)
    document.addEventListener("visibilitychange", function () {
        if (document.hidden && isDetecting) {
            // Optionally reduce detection rate or pause
            // We'll keep running but the interval is already low
        }
    });

    // Handle page unload
    window.addEventListener("beforeunload", function () {
        if (isDetecting) {
            stopDetection();
        }
    });

    // ---------------------------------------------------------------
    // Initial Status
    // ---------------------------------------------------------------
    setStatus("idle", "Ready - Press Start to begin");

    // Check browser support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setStatus("error", "Camera not supported in this browser.");
        startBtn.disabled = true;
    }

    if (!window.speechSynthesis) {
        console.warn("SpeechSynthesis not supported.");
    }

    console.log("Vision Assistant loaded.");
})();
