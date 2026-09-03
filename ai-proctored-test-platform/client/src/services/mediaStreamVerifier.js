/**
 * mediaStreamVerifier.js
 * Shared utility for verifying authentic, live, non-static media streams.
 * Reused across pre-test Instructions page (BUG-42) and mid-test proctoring (BUG-29, BUG-40, BUG-41).
 */

/**
 * Checks system hardware devices via enumerateDevices.
 * @returns {Promise<{ hasVideo: boolean, hasAudio: boolean, videoCount: number, audioCount: number }>}
 */
export async function checkHardwareDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return { hasVideo: true, hasAudio: true, videoCount: 1, audioCount: 1 };
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter((d) => d.kind === 'videoinput');
    const audioDevices = devices.filter((d) => d.kind === 'audioinput');
    return {
      hasVideo: videoDevices.length > 0,
      hasAudio: audioDevices.length > 0,
      videoCount: videoDevices.length,
      audioCount: audioDevices.length,
    };
  } catch (err) {
    console.warn('[mediaStreamVerifier] enumerateDevices failed:', err);
    return { hasVideo: true, hasAudio: true, videoCount: 1, audioCount: 1 };
  }
}

/**
 * Verifies that a MediaStream from getUserMedia has a truly live, active video track
 * that is delivering actual video frames rather than an idle driver placeholder
 * (e.g. Iriun Webcam's static "Looking for the phone" cat image or OBS virtual cam).
 *
 * @param {MediaStream} stream - The stream returned from getUserMedia
 * @param {number} timeoutMs - Max time to wait for initial dimensions (default: 1500ms)
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
export async function verifyActiveVideoStream(stream, timeoutMs = 1500) {
  if (!stream) {
    return { ok: false, reason: 'NO_STREAM' };
  }

  const videoTracks = stream.getVideoTracks();
  if (!videoTracks || videoTracks.length === 0) {
    return { ok: false, reason: 'NO_VIDEO_TRACKS' };
  }

  const track = videoTracks[0];
  if (track.readyState !== 'live' || track.muted || !track.enabled) {
    return { ok: false, reason: 'TRACK_NOT_LIVE' };
  }

  // Create temporary offscreen video element to test frame presentation
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  video.srcObject = stream;

  try {
    await video.play().catch(() => {});

    // Wait until video has loaded dimensions
    const startTime = Date.now();
    while (video.videoWidth === 0 || video.videoHeight === 0) {
      if (Date.now() - startTime > timeoutMs) {
        return { ok: false, reason: 'NO_DIMENSIONS' };
      }
      await new Promise((r) => setTimeout(r, 60));
    }

    // Sample 2 frames to check for sensor motion/noise (detects static virtual camera graphics)
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 24;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      return { ok: true }; // Fallback if canvas context unavailable
    }

    ctx.drawImage(video, 0, 0, 32, 24);
    const frame1 = ctx.getImageData(0, 0, 32, 24).data;

    // Wait 400ms for camera sensor to deliver a subsequent frame
    await new Promise((r) => setTimeout(r, 400));

    ctx.drawImage(video, 0, 0, 32, 24);
    const frame2 = ctx.getImageData(0, 0, 32, 24).data;

    let diff = 0;
    for (let i = 0; i < frame1.length; i += 4) {
      diff +=
        Math.abs(frame1[i] - frame2[i]) +
        Math.abs(frame1[i + 1] - frame2[i + 1]) +
        Math.abs(frame1[i + 2] - frame2[i + 2]);
    }

    // A real physical camera sensor (even in complete darkness or pointed at a blank wall)
    // always exhibits natural CMOS photon/thermal shot noise (diff > 0).
    // A synthetic driver image (like Iriun's static cat placeholder or disconnected graphic)
    // has EXACTLY diff === 0 across all color channels.
    if (diff === 0) {
      console.warn(
        `[mediaStreamVerifier] Video stream is completely static (diff = 0). Label: "${track.label}". Likely an idle/disconnected virtual camera placeholder.`
      );
      return { ok: false, reason: 'STATIC_PLACEHOLDER' };
    }

    return { ok: true };
  } catch (err) {
    console.warn('[mediaStreamVerifier] Video verification error:', err);
    return { ok: false, reason: err.name || err.message };
  } finally {
    try {
      video.srcObject = null;
      video.remove();
    } catch {}
  }
}
