// useProctoring.js — Client-Side AI Proctoring Hook using MediaPipe FaceDetector
// Implements PRD Section 2.1, Section 9.8, Section 10, Section 11.5 (FR-5.2-5.4), Section 11.7 (FR-7.1, FR-7.2), Section 15 (MediaPipe FaceDetector)
import { useState, useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { FilesetResolver, FaceDetector } from '@mediapipe/tasks-vision';
import api from '../services/apiClient';
import { emitTabSwitch, emitFullscreenExit } from '../services/socketClient';
import { getScreenStream } from '../services/screenStreamManager';

/**
 * Custom hook for full client-side proctoring:
 * 1. Mandatory webcam + mic stream management (FR-5.2)
 * 2. Official MediaPipe FaceDetector task for continuous face presence & multi-face counting (FR-7.1, Section 15)
 * 3. Periodic YOLO phone detection frame upload every 7.5s (FR-7.2)
 * 4. Fullscreen lock & exit detection (FR-5.2, FR-5.3)
 * 5. Tab switch / blur detection (FR-5.3)
 * 6. Copy-paste / right-click prevention (FR-5.4)
 * 7. Live screen-share capture for TAB_SWITCH and FULLSCREEN_EXIT proof (BUG-13)
 */
export function useProctoring({
  testId,
  roomId,
  candidateId,
  enabled = true,
  allowInternalCopyPaste = false, // true only for AI Test internal chat-to-editor (FR-6.1)
  onWarning,
  onDisqualified,
}) {
  const videoRef = useRef(null);
  const screenVideoRef = useRef(null);
  const streamRef = useRef(null);
  const faceDetectorRef = useRef(null);

  // Statuses
  const [hasWebcam, setHasWebcam] = useState(false);
  const [hasMic, setHasMic] = useState(false);
  const [isMediaReady, setIsMediaReady] = useState(false);
  // BUG-34: Initialize from the actual document fullscreen state rather than assuming true on reload
  const [isFullscreen, setIsFullscreen] = useState(() => {
    return Boolean(
      typeof document !== 'undefined' &&
      (document.fullscreenElement || document.webkitFullscreenElement)
    );
  });
  const [faceCount, setFaceCount] = useState(1);
  const [proctoringActive, setProctoringActive] = useState(false);
  const [detectorReady, setDetectorReady] = useState(false);

  // Camera Disconnection Tracking (Immediate Blackout & Lockdown Security Feature)
  const [isCameraDisconnected, setIsCameraDisconnected] = useState(false);
  const [hasHardwareCamera, setHasHardwareCamera] = useState(true);
  const [isVerifyingFace, setIsVerifyingFace] = useState(false);
  const isCameraDisconnectedRef = useRef(false);
  const cameraDisconnectTimeRef = useRef(null);
  const activeDeviceIdRef = useRef(null);
  const activeTrackRef = useRef(null);

  // Frame presentation & stream stall tracking (BUG-29, BUG-40, BUG-42)
  const lastFramePresentedTimeRef = useRef(Date.now() + 4000);
  const lastVideoTotalFramesRef = useRef(-1);
  const lastVideoCurrentTimeRef = useRef(-1);
  const frameCallbackIdRef = useRef(null);

  const candidateIdRef = useRef(candidateId);
  const testIdRef = useRef(testId);
  const roomIdRef = useRef(roomId);
  const onWarningRef = useRef(onWarning);
  const hasCheckedInitialFullscreenRef = useRef(false);

  useEffect(() => {
    candidateIdRef.current = candidateId;
    testIdRef.current = testId;
    roomIdRef.current = roomId;
    onWarningRef.current = onWarning;
  }, [candidateId, testId, roomId, onWarning]);

  // Absence Tracking for NO_FACE_15MIN (PRD FR-7.1)
  const noFaceStartTimeRef = useRef(null);
  const noFaceReportedRef = useRef(false);

  // Consecutive detection counter for MULTIPLE_FACES (prevents single-frame lens/reflection false positives)
  const multiFaceCountRef = useRef(0);

  // Debounce refs for violations (prevent spamming API within 5s per violation type)
  const lastViolationTimeRef = useRef({});

  // Set to track pending delayed screenshot timeouts for clean unmounting (BUG-31)
  const delayedViolationTimeoutsRef = useRef(new Set());

  // Keyboard lock state tracker (BUG-33: prevents redundant keyboard.lock() calls that keep native prompt visible)
  const isKeyboardLockedRef = useRef(false);

  const unlockKeyboard = useCallback(() => {
    if (!isKeyboardLockedRef.current) return;
    if ('keyboard' in navigator && typeof navigator.keyboard.unlock === 'function') {
      try {
        navigator.keyboard.unlock();
        isKeyboardLockedRef.current = false;
        console.log('[Proctoring] Keyboard lock released');
      } catch (err) {
        console.warn('[Proctoring] Keyboard unlock failed:', err?.message || err);
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      // Clear keyboard lock and all active delayed violation timers on unmount
      unlockKeyboard();
      delayedViolationTimeoutsRef.current.forEach((id) => clearTimeout(id));
      delayedViolationTimeoutsRef.current.clear();
    };
  }, [unlockKeyboard]);

  // ── Helper: Capture Real-time Proof Screenshot for any Violation ──────────────
  const captureViolationProof = useCallback((violationType, timestampDate = new Date()) => {
    try {
      // ASSUMPTION: 'TAB_SWITCH', 'FULLSCREEN_EXIT', 'CAMERA_DISCONNECTED', and 'OTHER' capture candidate's monitor/screen display evidence.
      // Physical presence violations ('PHONE_DETECTED', 'MULTIPLE_FACES', 'NO_FACE_15MIN') capture webcam frames.
      const isScreenViolation =
        violationType === 'TAB_SWITCH' ||
        violationType === 'FULLSCREEN_EXIT' ||
        violationType === 'CAMERA_DISCONNECTED' ||
        violationType === 'OTHER';

      // 1. Screen Monitor Capture for TAB_SWITCH, FULLSCREEN_EXIT, and OTHER (BUG-13)
      if (isScreenViolation && screenVideoRef.current && screenVideoRef.current.readyState >= 2) {
        const sw = screenVideoRef.current.videoWidth || 1280;
        const sh = screenVideoRef.current.videoHeight || 720;

        const canvas = document.createElement('canvas');
        canvas.width = sw;
        canvas.height = sh;
        const ctx = canvas.getContext('2d');

        // Draw live screen capture frame (captures active monitor / tab)
        ctx.drawImage(screenVideoRef.current, 0, 0, sw, sh);

        // Overlay proctoring violation watermark header
        ctx.fillStyle = 'rgba(15, 23, 42, 0.90)';
        ctx.fillRect(0, 0, sw, 44);

        ctx.fillStyle = '#EF4444';
        ctx.font = 'bold 15px sans-serif';
        ctx.fillText(`⚠️ PROCTORING EVIDENCE: ${violationType.replace(/_/g, ' ')} (SCREEN CAPTURE)`, 16, 28);

        // Timestamp & metadata footer
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fillRect(0, sh - 30, sw, 30);
        ctx.fillStyle = '#E2E8F0';
        ctx.font = '12px monospace';
        const displayTime = timestampDate.toLocaleTimeString();
        const displayDate = timestampDate.toLocaleDateString();
        ctx.fillText(`Time: ${displayTime} · ${displayDate} | Candidate: ${candidateId} | Screen Monitor Capture`, 16, sh - 10);

        return canvas.toDataURL('image/jpeg', 0.85);
      }

      // 2. Webcam Capture for PHONE_DETECTED, MULTIPLE_FACES, NO_FACE_15MIN (or fallback)
      if (videoRef.current && videoRef.current.readyState >= 2) {
        const vw = videoRef.current.videoWidth || 640;
        const vh = videoRef.current.videoHeight || 480;

        const canvas = document.createElement('canvas');
        canvas.width = vw;
        canvas.height = vh;
        const ctx = canvas.getContext('2d');

        // Draw live webcam frame
        ctx.drawImage(videoRef.current, 0, 0, vw, vh);

        // Overlay proctoring violation watermark header
        ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
        ctx.fillRect(0, 0, vw, 40);

        // Violation badge indicator
        ctx.fillStyle = violationType === 'PHONE_DETECTED' || violationType === 'MULTIPLE_FACES' ? '#EF4444' : '#F59E0B';
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText(`⚠️ PROCTORING EVIDENCE: ${violationType.replace(/_/g, ' ')}`, 14, 25);

        // Timestamp & metadata footer
        ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
        ctx.fillRect(0, vh - 26, vw, 26);
        ctx.fillStyle = '#E2E8F0';
        ctx.font = '11px monospace';
        const displayTime = timestampDate.toLocaleTimeString();
        const displayDate = timestampDate.toLocaleDateString();
        ctx.fillText(`Time: ${displayTime} · ${displayDate}`, 14, vh - 9);

        return canvas.toDataURL('image/jpeg', 0.85);
      }

      // Fallback: create high-visibility violation banner snapshot
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 640, 480);
      ctx.fillStyle = '#EF4444';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText(`⚠️ PROCTORING VIOLATION: ${violationType.replace(/_/g, ' ')}`, 30, 80);
      ctx.fillStyle = '#ffffff';
      ctx.font = '13px monospace';
      ctx.fillText(`Detected At: ${timestampDate.toLocaleString()}`, 30, 130);
      ctx.fillText(`Candidate ID: ${candidateId}`, 30, 160);
      ctx.fillText(`Test ID: ${testId} | Room: ${roomId}`, 30, 190);
      return canvas.toDataURL('image/jpeg', 0.85);
    } catch (e) {
      console.error('Failed to capture violation proof:', e);
      return null;
    }
  }, [candidateId, testId, roomId]);

  // ── Helper: Capture Webcam Screenshot ───────────────────────────────────────
  const captureWebcamScreenshot = useCallback((violationType = 'CAMERA_CAPTURE') => {
    return captureViolationProof(violationType);
  }, [captureViolationProof]);

  // ── Helper: Capture Screen Snapshot ─────────────────────────────────────────
  const captureScreenSnapshot = useCallback(() => {
    return captureViolationProof('SCREEN_SNAPSHOT');
  }, [captureViolationProof]);

  // ── Helper: Send Violation to API ───────────────────────────────────────────
  const sendViolationApi = useCallback(async (violationType, proof, detectedAt) => {
    const cId = candidateIdRef.current || candidateId;
    const tId = testIdRef.current || testId;
    const rId = roomIdRef.current || roomId;

    console.warn(`[Proctoring] Submitting violation to API: ${violationType} with proof screenshot (detectedAt: ${detectedAt})`);
    try {
      await api.reportViolation({
        candidateId: cId,
        testId: tId,
        roomId: rId,
        violationType,
        screenshotBase64: proof,
        detectedAt,
      });
    } catch (err) {
      console.error(`[Proctoring] Failed to report ${violationType}:`, err);
    }
  }, [candidateId, testId, roomId]);

  // ── Helper: Immediate Violation Reporter (MULTIPLE_FACES, NO_FACE_15MIN, CAMERA_DISCONNECTED) ──
  const reportViolation = useCallback(async (violationType, screenshotBase64) => {
    const now = Date.now();
    const lastTime = lastViolationTimeRef.current[violationType] || 0;
    if (now - lastTime < 5000) {
      // Throttle violation reports to at most once per 5s per type
      return;
    }
    lastViolationTimeRef.current[violationType] = now;

    const detectedAt = new Date(now).toISOString();
    const proof = screenshotBase64 || captureViolationProof(violationType, new Date(now));
    await sendViolationApi(violationType, proof, detectedAt);
  }, [captureViolationProof, sendViolationApi]);

  // ── BUG-31: 1-Second Delayed Screen-Share Capture for TAB_SWITCH & FULLSCREEN_EXIT ──
  // Immediately logs the violation, fires socket event and candidate warning banner,
  // then waits 1 second for the screen/window transition to settle before grabbing proof.
  const triggerDelayedScreenViolation = useCallback((violationType, onImmediate) => {
    const now = Date.now();
    const lastTime = lastViolationTimeRef.current[violationType] || 0;
    if (now - lastTime < 5000) {
      // Throttle violation reports to at most once per 5s per type
      return;
    }
    lastViolationTimeRef.current[violationType] = now;

    // 1. Immediately record detection timestamp
    const detectedAt = new Date(now).toISOString();

    // 2. Immediately execute synchronous immediate handlers (toast banner, socket emit, candidate warning)
    if (typeof onImmediate === 'function') {
      try {
        onImmediate(detectedAt);
      } catch (err) {
        console.error('[Proctoring] Error in immediate violation handler:', err);
      }
    }

    // 3. Wait 1000ms before capturing the screen-share frame to let the screen state settle
    const timerId = setTimeout(() => {
      delayedViolationTimeoutsRef.current.delete(timerId);
      console.log(`[Proctoring] 1s settling delay elapsed for ${violationType}. Grabbing screen proof...`);
      const proof = captureViolationProof(violationType, new Date(detectedAt));
      sendViolationApi(violationType, proof, detectedAt);
    }, 1000);

    delayedViolationTimeoutsRef.current.add(timerId);
  }, [captureViolationProof, sendViolationApi]);

  /* ==========================================================================
   * ARCHITECTURAL DIRECTIVE & REGRESSION GUARD: WEBCAM DISCONNECT VS NO FACE
   * (BUG-29, BUG-40, BUG-41, BUG-42)
   *
   * WARNING: THIS DETECTION LOGIC HAS FAILED REPEATEDLY (4 OCCURRENCES).
   * DO NOT SIMPLIFY, SHORT-CIRCUIT, OR REORDER WITHOUT READING THIS SPEC:
   *
   * 1. LOW SEVERITY — "NO FACE DETECTED" (Briefly looking away or hand over face):
   *    - The camera IS physically connected and actively streaming video (~30 fps).
   *    - The browser video element is actively receiving new presented frames.
   *    - MediaPipe FaceDetector runs on the LIVE frame and finds 0 faces.
   *    - BEHAVIOR: Shows ONLY the small floating "❌ No Face!" badge in DraggableWebcamPip.
   *    - The test is NOT locked: candidate can still type, run code, and submit.
   *    - Only after 15 continuous minutes of absence is NO_FACE_15MIN reported.
   *
   * 2. HIGH SEVERITY — "CAMERA DISCONNECTED" (Physical unplug, broken link, driver stall):
   *    - The camera hardware is physically removed or has stopped delivering frames.
   *    - On Windows / Chromium (and especially with USB/virtual drivers like Iriun):
   *      a) track.readyState often remains 'live' indefinitely (does NOT become 'ended').
   *      b) track.onended does NOT reliably fire.
   *      c) enumerateDevices() still lists the virtual camera device.
   *      d) The video element retains the last frozen frame in its buffer.
   *    - DETECTION: The video element receives ZERO new frames (0 fps) for >2000ms,
   *      detected via requestVideoFrameCallback and getVideoPlaybackQuality().totalVideoFrames.
   *    - BEHAVIOR: Immediately activates full-screen blocking CameraDisconnectedOverlay.
   *    - LOCKDOWN: Editor becomes readOnly; Run, Submit, Tabs, Language are disabled.
   *    - Timer keeps running on overlay. "Reconnect Camera" and "Submit All" remain clickable.
   *    - NEVER run MediaPipe face detection on a stalled/frozen frame.
   *    - NEVER auto-reconnect in a 1-second polling loop while disconnected. Reconnection
   *      happens ONLY when user clicks "Reconnect Camera" or on a genuine devicechange event.
   * ========================================================================== */

  // ── Camera Disconnect Handler (Immediate Fullscreen Blocking & Lockdown) ────
  const handleCameraDisconnected = useCallback(() => {
    if (isCameraDisconnectedRef.current) return;
    isCameraDisconnectedRef.current = true;
    setIsCameraDisconnected(true);
    setHasHardwareCamera(false);
    setIsVerifyingFace(false);
    cameraDisconnectTimeRef.current = Date.now();

    // Reset absence timer so it doesn't wait 15 minutes
    noFaceStartTimeRef.current = null;
    noFaceReportedRef.current = false;

    // Clean up dead/stale stream and tracks so they cannot be mistakenly judged as live
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((t) => t.stop());
      } catch {}
      streamRef.current = null;
    }
    activeTrackRef.current = null;
    if (videoRef.current) {
      try {
        videoRef.current.srcObject = null;
      } catch {}
    }
    lastVideoTotalFramesRef.current = -1;
    lastVideoCurrentTimeRef.current = -1;

    console.warn('[Proctoring] CAMERA_DISCONNECTED triggered! Blocking screen and alerting server.');
    const proof = captureViolationProof('CAMERA_DISCONNECTED');

    const curCandidateId = candidateIdRef.current || candidateId;
    const curTestId = testIdRef.current || testId;
    const curRoomId = roomIdRef.current || roomId;

    api.reportCameraDisconnected({
      candidateId: curCandidateId,
      testId: curTestId,
      roomId: curRoomId,
      disconnectAt: new Date(cameraDisconnectTimeRef.current),
      screenshotBase64: proof,
    }).catch((err) => console.error('[Proctoring] Failed to report camera disconnect:', err));
  }, [candidateId, testId, roomId, captureViolationProof]);

  // ── Camera Reconnect Handler (Immediate Recovery & Dismissal) ───────────────
  const handleCameraReconnected = useCallback(() => {
    if (!isCameraDisconnectedRef.current) return;
    const reconnectTime = Date.now();
    const durationSec = Math.max(
      1,
      Math.round((reconnectTime - (cameraDisconnectTimeRef.current || reconnectTime)) / 1000)
    );

    console.log(`[Proctoring] Camera reconnected! Disconnected duration: ${durationSec}s`);
    const curCandidateId = candidateIdRef.current || candidateId;
    const curTestId = testIdRef.current || testId;
    const curRoomId = roomIdRef.current || roomId;

    api.reportCameraReconnected({
      candidateId: curCandidateId,
      testId: curTestId,
      roomId: curRoomId,
      reconnectAt: new Date(reconnectTime),
      durationSeconds: durationSec,
    }).catch((err) => console.error('[Proctoring] Failed to report camera reconnect:', err));

    isCameraDisconnectedRef.current = false;
    setIsCameraDisconnected(false);
    setIsVerifyingFace(false);
    setHasHardwareCamera(true);
    toast.success('Camera verified and reconnected. Test resumed.');
  }, [candidateId, testId, roomId]);

  // ── Track Listener Helper (Handles onended and onmute for physical disconnection) ──
  const attachTrackListeners = useCallback((stream) => {
    if (!stream) return;
    const videoTracks = stream.getVideoTracks();
    if (videoTracks.length > 0) {
      const track = videoTracks[0];
      activeTrackRef.current = track;
      activeDeviceIdRef.current = track.getSettings()?.deviceId || activeDeviceIdRef.current;
      track.onended = () => {
        console.warn('[Proctoring] videoTrack onended dispatched');
        handleCameraDisconnected();
      };
      track.onmute = () => {
        console.warn('[Proctoring] videoTrack onmute dispatched');
        handleCameraDisconnected();
      };
    }
    stream.onremovetrack = () => {
      console.warn('[Proctoring] stream onremovetrack dispatched');
      handleCameraDisconnected();
    };
    stream.oninactive = () => {
      console.warn('[Proctoring] stream oninactive dispatched');
      handleCameraDisconnected();
    };
  }, [handleCameraDisconnected]);

  // ── Camera Reconnect Attempt (via Manual Retry button or Auto-Detection) ───
  const reconnectCamera = useCallback(async () => {
    try {
      console.log('[Proctoring] Attempting to reconnect camera stream...');
      if (navigator.mediaDevices?.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter((d) => d.kind === 'videoinput');
        if (videoDevices.length === 0) {
          console.warn('[Proctoring] No videoinput devices found on system.');
          setHasHardwareCamera(false);
          setIsVerifyingFace(false);
          return null;
        }
      }

      setIsVerifyingFace(true);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } },
        audio: true,
      });

      const videoTracks = stream.getVideoTracks();
      if (!videoTracks || videoTracks.length === 0 || videoTracks[0].readyState !== 'live') {
        throw new Error('No live video track returned from getUserMedia');
      }

      const track = videoTracks[0];
      streamRef.current = stream;
      activeTrackRef.current = track;
      activeDeviceIdRef.current = track.getSettings()?.deviceId || null;
      attachTrackListeners(stream);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      setHasHardwareCamera(true);
      setIsVerifyingFace(false);

      // Re-acquired live stream — dismiss overlay & resume test
      handleCameraReconnected();
      return stream;
    } catch (err) {
      console.warn('[Proctoring] Camera reconnect failed or still disconnected:', err.message);
      setHasHardwareCamera(false);
      setIsVerifyingFace(false);
      // NOTE: isCameraDisconnected remains TRUE so the overlay stays visible and does not disappear!
      return null;
    }
  }, [attachTrackListeners, handleCameraReconnected]);

  useEffect(() => {
    window.__simulateCameraDisconnect = () => {
      const tracks = streamRef.current?.getVideoTracks() || [];
      tracks.forEach((t) => {
        t.stop();
        try {
          Object.defineProperty(t, 'muted', { value: true, writable: true });
        } catch {}
        t.dispatchEvent(new Event('ended'));
        t.dispatchEvent(new Event('mute'));
      });
      handleCameraDisconnected();
    };
    window.__simulateCameraReconnect = () => {
      return reconnectCamera();
    };
    return () => {
      delete window.__simulateCameraDisconnect;
      delete window.__simulateCameraReconnect;
    };
  }, [handleCameraDisconnected, reconnectCamera]);

  // ── 1. Mandatory Media Stream Initialization (FR-5.2) ───────────────────────
  const initMediaStream = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } },
        audio: true,
      });

      streamRef.current = stream;
      attachTrackListeners(stream);

      const videoTracks = stream.getVideoTracks();
      const audioTracks = stream.getAudioTracks();

      setHasWebcam(videoTracks.length > 0 && videoTracks[0].enabled);
      setHasMic(audioTracks.length > 0 && audioTracks[0].enabled);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }

      setIsMediaReady(true);
      return stream;
    } catch (err) {
      console.error('[Proctoring] Media permission error:', err);
      setHasWebcam(false);
      setHasMic(false);
      setIsMediaReady(false);
      toast.error('Webcam and Microphone permissions are required to take this assessment.');
      return null;
    }
  }, [attachTrackListeners]);

  // ── 2. Official MediaPipe FaceDetector Task Initialization (PRD §15) ────────
  // Uses MediaPipe BlazeFace short-range vision model for in-browser face count detection
  useEffect(() => {
    if (!enabled) return;

    let isMounted = true;

    const setupMediaPipe = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
        );

        if (!isMounted) return;

        const detector = await FaceDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          minDetectionConfidence: 0.65, // Increased to 0.65 to prevent phone camera lenses / reflections from false-triggering face detector
        });

        if (isMounted) {
          faceDetectorRef.current = detector;
          setDetectorReady(true);
          console.log('[Proctoring] MediaPipe FaceDetector initialized successfully');
        }
      } catch (err) {
        console.warn('[Proctoring] MediaPipe GPU delegate fallback to CPU:', err.message);
        try {
          const vision = await FilesetResolver.forVisionTasks(
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
          );
          if (!isMounted) return;
          const detector = await FaceDetector.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath:
                'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
              delegate: 'CPU',
            },
            runningMode: 'VIDEO',
            minDetectionConfidence: 0.65, // Increased to 0.65 to eliminate phone lens false positives
          });
          if (isMounted) {
            faceDetectorRef.current = detector;
            setDetectorReady(true);
          }
        } catch (fallbackErr) {
          console.error('[Proctoring] MediaPipe FaceDetector initialization failed:', fallbackErr);
        }
      }
    };

    setupMediaPipe();

    return () => {
      isMounted = false;
      if (faceDetectorRef.current) {
        faceDetectorRef.current.close();
        faceDetectorRef.current = null;
      }
    };
  }, [enabled]);

  // ── Continuous Frame Delivery Tracking via requestVideoFrameCallback ───────
  useEffect(() => {
    if (!enabled || !isMediaReady) return;
    let isCancelled = false;

    const scheduleNextFrame = () => {
      if (isCancelled) return;
      const video = videoRef.current;
      if (video && 'requestVideoFrameCallback' in video) {
        frameCallbackIdRef.current = video.requestVideoFrameCallback(() => {
          lastFramePresentedTimeRef.current = Date.now();
          scheduleNextFrame();
        });
      }
    };

    scheduleNextFrame();

    return () => {
      isCancelled = true;
      const video = videoRef.current;
      if (video && frameCallbackIdRef.current && 'cancelVideoFrameCallback' in video) {
        try {
          video.cancelVideoFrameCallback(frameCallbackIdRef.current);
        } catch {}
      }
    };
  }, [enabled, isMediaReady, isCameraDisconnected]);

  // ── Continuous In-Browser MediaPipe Face Detection Loop (FR-7.1, PRD §2.1) ──
  useEffect(() => {
    if (!enabled || !isMediaReady || !detectorReady) return;

    let isCancelled = false;
    let detectionInterval = null;

    detectionInterval = setInterval(() => {
      if (isCancelled || !faceDetectorRef.current) return;

      // When camera is already disconnected, suppress face detection and avoid running on stale frames
      if (isCameraDisconnectedRef.current) {
        return;
      }

      const video = videoRef.current;
      const videoTrack = streamRef.current?.getVideoTracks()?.[0] || activeTrackRef.current;

      const isTrackEnded =
        !videoTrack ||
        videoTrack.readyState === 'ended' ||
        videoTrack.muted ||
        !videoTrack.enabled;

      const isVideoUnavailable =
        !video ||
        video.readyState < 2 ||
        video.paused ||
        video.ended;

      // ── Native Frame Progression Checks ───────────────────────────────────
      // 1. Check VideoPlaybackQuality totalVideoFrames (Chromium)
      if (video && typeof video.getVideoPlaybackQuality === 'function') {
        try {
          const q = video.getVideoPlaybackQuality();
          if (q && q.totalVideoFrames > lastVideoTotalFramesRef.current) {
            lastVideoTotalFramesRef.current = q.totalVideoFrames;
            lastFramePresentedTimeRef.current = Date.now();
          }
        } catch {}
      }

      // 2. Check currentTime advancement
      if (video && video.currentTime !== lastVideoCurrentTimeRef.current) {
        lastVideoCurrentTimeRef.current = video.currentTime;
        lastFramePresentedTimeRef.current = Date.now();
      }

      // If document is hidden/minimized, frame rendering is throttled by the browser;
      // Do not treat tab blur as camera disconnect (tab switch has its own violation logger).
      if (document.hidden) {
        lastFramePresentedTimeRef.current = Date.now();
      }

      // ── Frame Delivery Stall Detection (Detects physical unplug on Windows/Chromium/Iriun) ──
      const timeSinceLastFrame = Date.now() - lastFramePresentedTimeRef.current;
      const isFrameStalled = isMediaReady && !document.hidden && timeSinceLastFrame > 2000;

      // ── Physical Camera Disconnect Check (Immediate Fullscreen Blocking) ────
      if (isTrackEnded || (isVideoUnavailable && isMediaReady) || isFrameStalled) {
        if (!isCameraDisconnectedRef.current) {
          console.warn(`[Proctoring] Physical camera disconnect detected! (trackEnded: ${isTrackEnded}, videoUnavailable: ${isVideoUnavailable}, frameStalled: ${isFrameStalled}, msSinceFrame: ${timeSinceLastFrame})`);
          handleCameraDisconnected();
        }
        return;
      }

      try {
        const startTimeMs = performance.now();
        // MediaPipe FaceDetector task detectForVideo — ONLY runs when camera is delivering LIVE frames
        const result = faceDetectorRef.current.detectForVideo(video, startTimeMs);
        // Filter valid face detections: score >= 0.65 and minimum size (eliminates microscopic reflections/camera lenses)
        const vw = video.videoWidth || 640;
        const vh = video.videoHeight || 480;
        const minFaceDimension = Math.min(vw, vh) * 0.08; // at least 8% of frame dimension

        const validDetections = (result.detections || []).filter((d) => {
          const box = d.boundingBox;
          if (!box) return true;
          return box.width >= minFaceDimension && box.height >= minFaceDimension;
        });

        const detectedFaces = validDetections.length;
        setFaceCount(detectedFaces);

        // FR-7.1: Multiple faces detected violation — requires 2 consecutive positive checks (2s) to avoid single-frame glitch
        if (detectedFaces > 1) {
          multiFaceCountRef.current = (multiFaceCountRef.current || 0) + 1;
          if (multiFaceCountRef.current >= 2) {
            const proof = captureWebcamScreenshot();
            reportViolation('MULTIPLE_FACES', proof);
            toast.error('⚠️ Multiple faces detected! Only the candidate is permitted in frame.');
          }
        } else {
          multiFaceCountRef.current = 0;
        }

        // FR-7.1 & Point 7: No face detected — 15 minute continuous absence tracking
        if (detectedFaces === 0) {
          if (!noFaceStartTimeRef.current) {
            noFaceStartTimeRef.current = Date.now();
          } else {
            const absenceDuration = Date.now() - noFaceStartTimeRef.current;
            // 15 minutes = 15 * 60 * 1000 = 900,000 ms
            if (absenceDuration >= 15 * 60 * 1000 && !noFaceReportedRef.current) {
              noFaceReportedRef.current = true;
              const proof = captureWebcamScreenshot();
              reportViolation('NO_FACE_15MIN', proof);
              toast.error('⚠️ Absence violation: No face detected for over 15 minutes.');
            }
          }
        } else {
          // Reset absence tracking when face is detected
          noFaceStartTimeRef.current = null;
          noFaceReportedRef.current = false;
        }
      } catch (err) {
        console.debug('[Proctoring] Face detection frame error:', err.message);
      }
    }, 1000); // 1s loop running client-side on GPU/WASM

    return () => {
      isCancelled = true;
      if (detectionInterval) clearInterval(detectionInterval);
    };
  }, [enabled, isMediaReady, detectorReady, captureWebcamScreenshot, reportViolation, handleCameraDisconnected]);

  // ── Hardware Event Listener for Reconnect / Device Changes (BUG-29, BUG-40, BUG-42) ────
  useEffect(() => {
    if (!enabled) return;

    let isMounted = true;
    let knownDeviceCount = -1;

    const onDeviceChange = async () => {
      if (!isMounted) return;
      try {
        if (!navigator.mediaDevices?.enumerateDevices) return;
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter((d) => d.kind === 'videoinput');

        console.log(`[Proctoring] devicechange event: found ${videoDevices.length} video device(s).`);

        if (!isCameraDisconnectedRef.current) {
          const currentTrack = streamRef.current?.getVideoTracks()?.[0] || activeTrackRef.current;
          const isTrackDead =
            !currentTrack ||
            currentTrack.readyState === 'ended' ||
            currentTrack.muted ||
            !currentTrack.enabled;

          const currentDeviceId = currentTrack?.getSettings()?.deviceId || activeDeviceIdRef.current;
          const activeDeviceGone = currentDeviceId
            ? !videoDevices.some((d) => d.deviceId === currentDeviceId)
            : videoDevices.length === 0;

          if (videoDevices.length === 0 || isTrackDead || activeDeviceGone) {
            console.warn('[Proctoring] Hardware disconnection detected via devicechange! Activating lock.');
            handleCameraDisconnected();
          }
        } else {
          // If currently disconnected and a new camera was plugged in, attempt auto-reconnect
          if (knownDeviceCount >= 0 && videoDevices.length > knownDeviceCount) {
            console.log('[Proctoring] New camera device plugged in! Attempting auto-reconnect...');
            reconnectCamera();
          }
        }
        knownDeviceCount = videoDevices.length;
      } catch (err) {
        console.warn('[Proctoring] Device change error:', err);
      }
    };

    navigator.mediaDevices?.enumerateDevices().then((devices) => {
      if (isMounted) {
        knownDeviceCount = devices.filter((d) => d.kind === 'videoinput').length;
      }
    }).catch(() => {});

    navigator.mediaDevices?.addEventListener('devicechange', onDeviceChange);

    return () => {
      isMounted = false;
      navigator.mediaDevices?.removeEventListener('devicechange', onDeviceChange);
    };
  }, [enabled, handleCameraDisconnected, reconnectCamera]);

  // ── 3. Periodic YOLO Phone Detection Frame Upload (FR-7.2) ───────────────────
  // Sent every 4.5s (in the 5-10s range per PRD FR-7.2) as throttled multipart/form-data
  useEffect(() => {
    if (!enabled || !isMediaReady || !testId) return;

    const captureAndSendFrame = () => {
      if (!videoRef.current || videoRef.current.readyState < 2) return;

      try {
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext('2d');
        // Ensure frame is captured from the live webcam stream (videoRef), never the hidden screen share
        ctx.drawImage(videoRef.current, 0, 0, 640, 480);

        canvas.toBlob((blob) => {
          if (!blob) return;
          const formData = new FormData();
          formData.append('image', blob, 'webcam_frame.jpg');

          // Send to POST /api/v1/proctoring/:testId/frame
          api.submitFrame(testId, formData).then((res) => {
            if (res.data?.phoneDetected) {
              console.warn('[Proctoring] 📱 YOLOv8 detected phone in frame!', res.data);
              toast.error('⚠️ Mobile phone detected in camera view! Mobile devices are strictly prohibited.', { duration: 6000 });
            } else {
              console.log('[Proctoring] YOLOv8 frame checked: no phone detected');
            }
          }).catch((err) => {
            console.debug('[Proctoring] Periodic frame submit result:', err.message);
          });
        }, 'image/jpeg', 0.75);
      } catch (err) {
        console.error('[Proctoring] Frame capture error:', err);
      }
    };

    // Initial check shortly after video is ready
    const initialTimer = setTimeout(captureAndSendFrame, 2000);
    const frameInterval = setInterval(captureAndSendFrame, 4500);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(frameInterval);
    };
  }, [enabled, isMediaReady, testId]);

  // ── 3.5. Screen Sharing Stream & Termination Monitor (BUG-13) ───────────────
  useEffect(() => {
    if (!enabled) return;

    const stream = getScreenStream();
    if (stream && stream.active) {
      // Connect hidden video element to DOM to guarantee continuous live frame decoding in Chromium compositor
      let video = document.getElementById('__proctoring_screen_video');
      if (!video) {
        video = document.createElement('video');
        video.id = '__proctoring_screen_video';
        video.autoplay = true;
        video.muted = true;
        video.playsInline = true;
        video.style.position = 'fixed';
        video.style.top = '-9999px';
        video.style.left = '-9999px';
        video.style.width = '1px';
        video.style.height = '1px';
        video.style.opacity = '0';
        video.style.pointerEvents = 'none';
        video.style.zIndex = '-9999';
        document.body.appendChild(video);
      }
      video.srcObject = stream;
      video.play().catch((err) => console.debug('[Proctoring] Screen stream play caught:', err.message));
      screenVideoRef.current = video;

      // Detect mid-test screen share revocation (Requirement 4)
      const track = stream.getVideoTracks()[0];
      if (track) {
        track.onended = () => {
          // ASSUMPTION: If candidate stops screen sharing mid-test via browser UI ("Stop sharing"), treat as FULLSCREEN_EXIT violation and warn candidate.
          console.warn('[Proctoring] Screen share stream was stopped mid-test!');
          toast.error('⚠️ Screen sharing was disconnected! Continuous screen sharing is mandatory.', { duration: 8000 });
          const proof = captureViolationProof('FULLSCREEN_EXIT');
          reportViolation('FULLSCREEN_EXIT', proof);
        };
      }
    }

    return () => {
      const el = document.getElementById('__proctoring_screen_video');
      if (el) {
        el.srcObject = null;
        el.remove();
      }
      screenVideoRef.current = null;
    };
  }, [enabled, captureViolationProof, reportViolation]);

  // ── Keyboard Lock API Helpers (Disables Alt+Tab, Escape, Meta in Fullscreen) ──
  // BUG-33: Guard with isKeyboardLockedRef to prevent redundant navigator.keyboard.lock() calls,
  // which continually re-trigger Chromium's native "press and hold Esc to exit" banner on re-renders.
  const lockKeyboard = useCallback(async () => {
    if (isKeyboardLockedRef.current) return;
    const inFullscreen = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
    if (!inFullscreen) return;

    if ('keyboard' in navigator && typeof navigator.keyboard.lock === 'function') {
      try {
        isKeyboardLockedRef.current = true;
        await navigator.keyboard.lock();
        console.log('[Proctoring] Keyboard lock engaged (Alt+Tab and system shortcuts restricted)');
      } catch (err) {
        isKeyboardLockedRef.current = false;
        console.warn('[Proctoring] Keyboard lock could not be engaged:', err?.message || err);
      }
    }
  }, []);

  // ── 4. Fullscreen Enforcement & Exit Detection (FR-5.2, FR-5.3, BUG-34) ─────
  useEffect(() => {
    if (!enabled) return;

    const handleFullscreenChange = () => {
      const inFullscreen = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
      setIsFullscreen(inFullscreen);

      if (inFullscreen) {
        lockKeyboard();
      } else {
        unlockKeyboard();
        // BUG-31: Immediate detection, socket alert, and toast; 1s delayed screen-capture screenshot
        triggerDelayedScreenViolation('FULLSCREEN_EXIT', () => {
          emitFullscreenExit({ candidateId, testId, roomId });
          if (typeof onWarningRef.current === 'function') {
            onWarningRef.current('Violation detected: FULLSCREEN EXIT. This has been flagged.');
          }
          toast.error('⚠️ Fullscreen exited! You must remain in full-screen mode.', { duration: 4000 });
        });
      }
    };

    // BUG-34: Check fullscreen state immediately upon mount/reload.
    // If candidate loads or refreshes outside fullscreen, immediately block and report violation.
    const inFullscreenOnMount = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
    if (inFullscreenOnMount) {
      setIsFullscreen(true);
      lockKeyboard();
    } else {
      setIsFullscreen(false);
      // ASSUMPTION: Fullscreen exits resulting from a browser refresh/reload are logged as standard FULLSCREEN_EXIT violations and count toward the candidate's malpractice total and disqualification threshold.
      if (!hasCheckedInitialFullscreenRef.current) {
        hasCheckedInitialFullscreenRef.current = true;
        triggerDelayedScreenViolation('FULLSCREEN_EXIT', () => {
          emitFullscreenExit({ candidateId, testId, roomId });
          if (typeof onWarningRef.current === 'function') {
            onWarningRef.current('Violation detected: FULLSCREEN EXIT. You must return to fullscreen mode to continue.');
          }
          toast.error('⚠️ Fullscreen required! You must remain in full-screen mode.', { duration: 4000 });
        });
      }
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, [enabled, candidateId, testId, roomId, triggerDelayedScreenViolation, lockKeyboard, unlockKeyboard]);

  // ── 5. Tab Switch / Window Blur Detection (FR-5.3) ───────────────────────────
  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // BUG-31: Immediate detection, socket alert, and toast; 1s delayed screen-capture screenshot
        triggerDelayedScreenViolation('TAB_SWITCH', () => {
          emitTabSwitch({ candidateId, testId, roomId });
          if (typeof onWarningRef.current === 'function') {
            onWarningRef.current('Violation detected: TAB SWITCH. This has been flagged.');
          }
          toast.error('⚠️ Tab switch detected! Switching tabs is strictly prohibited.', { duration: 4000 });
        });
      }
    };

    const handleWindowBlur = () => {
      // BUG-31: Immediate detection and socket alert; 1s delayed screen-capture screenshot
      triggerDelayedScreenViolation('TAB_SWITCH', () => {
        emitTabSwitch({ candidateId, testId, roomId });
        if (typeof onWarningRef.current === 'function') {
          onWarningRef.current('Violation detected: TAB SWITCH. This has been flagged.');
        }
      });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [enabled, candidateId, testId, roomId, triggerDelayedScreenViolation]);

  // ── 6. Copy-Paste / Right-Click Blocking (FR-5.4) ───────────────────────────
  useEffect(() => {
    if (!enabled) return;

    const handleCopy = (e) => {
      if (!allowInternalCopyPaste) {
        e.preventDefault();
        toast.error('Copying is disabled during the assessment (FR-5.4).');
      }
    };

    const handlePaste = (e) => {
      if (!allowInternalCopyPaste) {
        e.preventDefault();
        toast.error('Pasting is disabled during the assessment (FR-5.4).');
      }
    };

    const handleCut = (e) => {
      if (!allowInternalCopyPaste) {
        e.preventDefault();
      }
    };

    const handleContextMenu = (e) => {
      e.preventDefault(); // Disable right-click context menu
    };

    document.addEventListener('copy', handleCopy);
    document.addEventListener('paste', handlePaste);
    document.addEventListener('cut', handleCut);
    document.addEventListener('contextmenu', handleContextMenu);

    return () => {
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('paste', handlePaste);
      document.removeEventListener('cut', handleCut);
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [enabled, allowInternalCopyPaste]);

  // ── 7. Alt+Tab, Meta+Tab & Window Switching Shortcut Blocking ─────────────────
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e) => {
      // 1. Alt + Tab (and Alt + Shift + Tab)
      const isAltTab = (e.altKey || e.key === 'Alt') && (e.key === 'Tab' || e.code === 'Tab' || e.keyCode === 9);
      // 2. Windows/Meta + Tab
      const isMetaTab = (e.metaKey || e.key === 'Meta') && (e.key === 'Tab' || e.code === 'Tab' || e.keyCode === 9);
      // 3. Ctrl + Tab (browser tab switch)
      const isCtrlTab = e.ctrlKey && (e.key === 'Tab' || e.code === 'Tab' || e.keyCode === 9);
      // 4. Alt + Escape
      const isAltEsc = e.altKey && (e.key === 'Escape' || e.code === 'Escape' || e.keyCode === 27);
      // 5. Alt + ArrowLeft / ArrowRight (browser back/forward navigation)
      const isAltNav = e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight');

      if (isAltTab || isMetaTab || isCtrlTab || isAltEsc || isAltNav) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        toast.error('⚠️ Alt+Tab and window switching are disabled during the test!', {
          id: 'alt-tab-prohibited',
          duration: 3500,
        });
        return false;
      }

      // Prevent standalone Alt key from focusing browser menu bar
      if ((e.key === 'Alt' || e.code === 'AltLeft' || e.code === 'AltRight' || e.keyCode === 18) && !e.getModifierState?.('AltGraph')) {
        e.preventDefault();
      }

      // Block F11 (browser fullscreen toggle)
      if (e.key === 'F11') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return false;
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [enabled]);

  // Enter Fullscreen Helper (BUG-34)
  const requestFullscreen = async () => {
    try {
      const el = document.documentElement;
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        if (el.requestFullscreen) {
          await el.requestFullscreen();
        } else if (el.webkitRequestFullscreen) {
          await el.webkitRequestFullscreen();
        }
        setIsFullscreen(true);
        await lockKeyboard();
      }
    } catch (err) {
      console.error('[Proctoring] Fullscreen request failed:', err);
      toast.error('Failed to enter fullscreen mode. Please try clicking the button again.');
    }
  };

  // Auto-init media stream on mount
  useEffect(() => {
    initMediaStream().then(() => {
      setProctoringActive(true);
    });

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [initMediaStream]);

  return {
    videoRef,
    streamRef,
    hasWebcam,
    hasMic,
    isMediaReady,
    isFullscreen,
    faceCount,
    detectorReady,
    proctoringActive,
    requestFullscreen,
    initMediaStream,
    captureWebcamScreenshot,
    captureScreenSnapshot,
    isCameraDisconnected,
    hasHardwareCamera,
    isVerifyingFace,
    reconnectCamera,
  };
}

export default useProctoring;
