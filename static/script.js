/**
 * =============================================
 * Vision Assistant - Frontend JavaScript
 * =============================================
 * Mode: Capture → Detect → Speak
 * - Open camera as viewfinder
 * - Tap to capture a still photo
 * - Send to backend for YOLO detection
 * - Voice feedback in English / Hindi
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
    const capturedImg = document.getElementById("capturedImg");
    const spinner = document.getElementById("spinner");
    const videoOverlay = document.getElementById("videoOverlay");
    const videoWrapper = document.getElementById("videoWrapper");

    const openCameraBtn = document.getElementById("openCameraBtn");
    const captureBtn = document.getElementById("captureBtn");
    const retakeBtn = document.getElementById("retakeBtn");
    const closeCameraBtn = document.getElementById("closeCameraBtn");
    const toggleLang = document.getElementById("toggleLang");
    const langLabel = document.getElementById("langLabel");

    const statusText = document.getElementById("statusText");
    const statusDot = document.getElementById("statusDot");
    const objectsList = document.getElementById("objectsList");
    const objectCount = document.getElementById("objectCount");
    const speechText = document.getElementById("speechText");
    const currentObjectsSpan = document.getElementById("currentObjects");
    const lastSpokenSpan = document.getElementById("lastSpoken");

    // ---------------------------------------------------------------
    // State
    // ---------------------------------------------------------------
    let isCameraOn = false;
    let isProcessing = false;
    let isSpeaking = false;
    let language = "en";
    let stream = null;

    // Store last detection for smart speaking (compare changes)
    let lastObjectNames = new Set();
    let lastObjectCounts = {};
    let captureCount = 0;
    let lastSpokenMessage = "";

    // ---------------------------------------------------------------
    // Speak using Browser SpeechSynthesis API
    // ---------------------------------------------------------------
    function speak(text, lang) {
        if (!text || isSpeaking) return;

        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang === "hi" ? "hi-IN" : "en-US";
        utterance.rate = 0.95;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        utterance.onstart = function () {
            isSpeaking = true;
        };
        utterance.onend = function () {
            isSpeaking = false;
        };
        utterance.onerror = function () {
            isSpeaking = false;
        };

        // Try Hindi voice
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
    // Smart Speaking Logic — only speak if scene changed
    // ---------------------------------------------------------------
    function shouldSpeak(objects) {
        const currentNames = new Set(objects.map((o) => o.name));
        const currentCounts = {};
        objects.forEach((o) => {
            currentCounts[o.name] = (currentCounts[o.name] || 0) + 1;
        });

        let should = false;

        if (captureCount === 0) {
            should = true; // First capture — always speak
        } else {
            // New object appeared
            for (let name of currentNames) {
                if (!lastObjectNames.has(name)) {
                    should = true;
                    break;
                }
            }
            // Object disappeared
            if (!should) {
                for (let name of lastObjectNames) {
                    if (!currentNames.has(name)) {
                        should = true;
                        break;
                    }
                }
            }
            // Count changed
            if (!should) {
                for (let name of currentNames) {
                    if (currentCounts[name] !== lastObjectCounts[name]) {
                        should = true;
                        break;
                    }
                }
            }
        }

        // Update state
        lastObjectNames = currentNames;
        lastObjectCounts = currentCounts;
        captureCount++;

        return should;
    }

    // ---------------------------------------------------------------
    // Update UI with Detection Results
    // ---------------------------------------------------------------
    function updateUI(data) {
        const objects = data.objects || [];
        const descEn = data.description_en || "";
        const descHi = data.description_hi || "";

        // --- Objects List ---
        if (objects.length === 0) {
            objectsList.innerHTML =
                '<div class="empty-state">No objects detected in this capture.</div>';
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

        // --- Last Detection Summary ---
        if (objects.length > 0) {
            currentObjectsSpan.textContent = objects
                .map((o) => `${o.name} (${Math.round(o.confidence * 100)}%)`)
                .join(", ");
        } else {
            currentObjectsSpan.textContent = "No objects";
        }

        // --- Speech Box ---
        const displayText = language === "hi" ? descHi : descEn;
        speechText.textContent = displayText || "No description.";

        // --- Smart Speaking ---
        const should = shouldSpeak(objects);

        if (should && objects.length > 0) {
            const message = language === "hi" ? descHi : descEn;
            if (message && message !== lastSpokenMessage) {
                lastSpokenMessage = message;
                lastSpokenSpan.textContent = message;
                speak(message, language);
            }
        } else if (objects.length === 0 && captureCount > 0) {
            const emptyMsg =
                language === "hi"
                    ? "Koi vastu nahi dikh rahi hai."
                    : "No objects detected.";
            if (emptyMsg !== lastSpokenMessage) {
                lastSpokenMessage = emptyMsg;
                lastSpokenSpan.textContent = emptyMsg;
                speak(emptyMsg, language);
            }
        } else {
            // Scene unchanged — just update the display text
            if (lastSpokenMessage) {
                lastSpokenSpan.textContent = lastSpokenMessage;
            }
        }
    }

    // ---------------------------------------------------------------
    // Capture Photo & Send to Backend
    // ---------------------------------------------------------------
    async function captureAndDetect() {
        if (!isCameraOn || isProcessing) return;

        isProcessing = true;
        captureBtn.disabled = true;

        try {
            // 1. Capture frame from video
            canvas.width = video.videoWidth || 640;
            canvas.height = video.videoHeight || 480;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            // 2. Show captured image overlay
            const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
            capturedImg.src = dataUrl;
            capturedImg.classList.remove("hidden");

            // 3. Hide live video, show spinner
            video.style.opacity = "0.3";
            spinner.classList.remove("hidden");
            setStatus("processing", "Analyzing image...");

            // 4. Convert to blob for backend
            const blob = await new Promise((resolve) =>
                canvas.toBlob(resolve, "image/jpeg", 0.7)
            );
            if (!blob) throw new Error("Failed to capture image");

            // 5. Send to backend
            const formData = new FormData();
            formData.append("file", blob, "capture.jpg");

            const response = await fetch("/detect", {
                method: "POST",
                body: formData,
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();

            // 6. Hide spinner, restore video
            spinner.classList.add("hidden");
            video.style.opacity = "1";

            // 7. Update UI with results
            updateUI(data);
            setStatus("active", "Detection complete");

            // 8. Show retake button, hide capture button
            captureBtn.classList.add("hidden");
            retakeBtn.classList.remove("hidden");

        } catch (err) {
            console.error("Detection error:", err);
            spinner.classList.add("hidden");
            video.style.opacity = "1";
            setStatus("error", "Detection failed. Try again.");
        } finally {
            isProcessing = false;
        }
    }

    // ---------------------------------------------------------------
    // Retake — clear captured image, show live view again
    // ---------------------------------------------------------------
    function retake() {
        capturedImg.classList.add("hidden");
        capturedImg.src = "";
        retakeBtn.classList.add("hidden");
        captureBtn.classList.remove("hidden");
        captureBtn.disabled = false;
        setStatus("active", "Camera ready — tap Capture");
    }

    // ---------------------------------------------------------------
    // Camera Management
    // ---------------------------------------------------------------
    async function openCamera() {
        try {
            const constraints = {
                video: {
                    facingMode: "environment",
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                },
                audio: false,
            };

            stream = await navigator.mediaDevices.getUserMedia(constraints);
            video.srcObject = stream;
            videoOverlay.classList.add("hidden");

            isCameraOn = true;
            openCameraBtn.classList.add("hidden");
            closeCameraBtn.classList.remove("hidden");
            captureBtn.disabled = false;
            captureBtn.classList.remove("hidden");
            retakeBtn.classList.add("hidden");

            setStatus("active", "Camera ready — tap Capture & Detect");
            return true;
        } catch (err) {
            console.error("Camera error:", err);
            // Fallback
            try {
                const constraints = { video: true, audio: false };
                stream = await navigator.mediaDevices.getUserMedia(constraints);
                video.srcObject = stream;
                videoOverlay.classList.add("hidden");

                isCameraOn = true;
                openCameraBtn.classList.add("hidden");
                closeCameraBtn.classList.remove("hidden");
                captureBtn.disabled = false;
                captureBtn.classList.remove("hidden");
                setStatus("active", "Camera ready");
                return true;
            } catch (err2) {
                console.error("Fallback camera error:", err2);
                setStatus("error", "Camera access denied. Allow camera permission.");
                return false;
            }
        }
    }

    function closeCamera() {
        if (stream) {
            stream.getTracks().forEach((track) => track.stop());
            stream = null;
        }
        video.srcObject = null;
        videoOverlay.classList.remove("hidden");
        capturedImg.classList.add("hidden");
        spinner.classList.add("hidden");
        video.style.opacity = "1";

        isCameraOn = false;
        isProcessing = false;

        openCameraBtn.classList.remove("hidden");
        closeCameraBtn.classList.add("hidden");
        captureBtn.disabled = true;
        captureBtn.classList.remove("hidden");
        retakeBtn.classList.add("hidden");

        // Cancel any speech
        window.speechSynthesis.cancel();
        isSpeaking = false;

        setStatus("idle", "Camera closed");
    }

    // ---------------------------------------------------------------
    // Language Toggle
    // ---------------------------------------------------------------
    function toggleLanguage() {
        language = language === "en" ? "hi" : "en";
        langLabel.textContent = language === "en" ? "English" : "हिन्दी";

        // If there's a description in the speech box, re-speak it
        const currentDesc = speechText.textContent;
        if (currentDesc && currentDesc !== "Capture a photo to hear the description." && currentDesc !== "No description.") {
            speak(currentDesc, language);
        }

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
        if (type === "active") statusDot.classList.add("active");
        else if (type === "processing") statusDot.classList.add("processing");
        else if (type === "error") statusDot.classList.add("error");
        statusText.textContent = message;

        if (timeout) {
            setTimeout(() => {
                if (!isProcessing && !isCameraOn) {
                    statusDot.className = "status-dot";
                    statusText.textContent = "Ready";
                }
            }, timeout);
        }
    }

    // ---------------------------------------------------------------
    // Load voices (async on some browsers)
    // ---------------------------------------------------------------
    function loadVoices() {
        window.speechSynthesis.getVoices();
    }
    window.speechSynthesis.onvoiceschanged = loadVoices;
    loadVoices();

    // ---------------------------------------------------------------
    // Event Listeners
    // ---------------------------------------------------------------
    openCameraBtn.addEventListener("click", openCamera);
    captureBtn.addEventListener("click", captureAndDetect);
    retakeBtn.addEventListener("click", retake);
    closeCameraBtn.addEventListener("click", closeCamera);
    toggleLang.addEventListener("click", toggleLanguage);

    // Cleanup on page unload
    window.addEventListener("beforeunload", function () {
        if (isCameraOn) closeCamera();
    });

    // ---------------------------------------------------------------
    // Initial Status
    // ---------------------------------------------------------------
    setStatus("idle", "Tap Open Camera to start");

    // Check browser support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setStatus("error", "Camera not supported in this browser.");
        openCameraBtn.disabled = true;
    }

    if (!window.speechSynthesis) {
        console.warn("SpeechSynthesis not supported in this browser.");
    }

    console.log("Vision Assistant v2.0 — Capture Mode loaded.");
})();
