// mediaStreamManager.js — Unified manager for candidate MediaStream lifecycles (BUG-13, BUG-88)
// PRD FR-5.2, FR-5.3, Section 8.2: Screen capture MediaStream for TAB_SWITCH and FULLSCREEN_EXIT evidence.
// Manages active webcam, microphone, and screen-sharing streams and guarantees clean release on completion.

let activeScreenStream = null;
let activeMediaStream = null;

/**
 * Register or update the active screen sharing stream.
 * @param {MediaStream|null} stream 
 */
export const setScreenStream = (stream) => {
  activeScreenStream = stream;
  if (typeof window !== 'undefined') {
    window.__candidateScreenStream = stream;
  }
};

/**
 * Retrieve the active screen sharing stream if still active.
 * @returns {MediaStream|null}
 */
export const getScreenStream = () => {
  if (activeScreenStream && activeScreenStream.active) {
    return activeScreenStream;
  }
  if (typeof window !== 'undefined' && window.__candidateScreenStream && window.__candidateScreenStream.active) {
    activeScreenStream = window.__candidateScreenStream;
    return activeScreenStream;
  }
  return null;
};

/**
 * Stop and release the active screen sharing stream.
 */
export const stopScreenStream = () => {
  if (activeScreenStream) {
    try {
      activeScreenStream.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
      });
    } catch (_) {}
    activeScreenStream = null;
  }
  if (typeof window !== 'undefined') {
    if (window.__candidateScreenStream) {
      try {
        window.__candidateScreenStream.getTracks().forEach((track) => {
          track.onended = null;
          track.stop();
        });
      } catch (_) {}
    }
    window.__candidateScreenStream = null;
  }
};

/**
 * Register the active webcam/mic proctoring stream.
 * @param {MediaStream|null} stream 
 */
export const setActiveMediaStream = (stream) => {
  activeMediaStream = stream;
  if (typeof window !== 'undefined') {
    window.__candidateMediaStream = stream;
  }
};

/**
 * Retrieve the active webcam/mic stream.
 * @returns {MediaStream|null}
 */
export const getActiveMediaStream = () => {
  if (activeMediaStream && activeMediaStream.active) {
    return activeMediaStream;
  }
  if (typeof window !== 'undefined' && window.__candidateMediaStream && window.__candidateMediaStream.active) {
    activeMediaStream = window.__candidateMediaStream;
    return activeMediaStream;
  }
  return null;
};

/**
 * Stop and release the active webcam/mic stream.
 */
export const stopActiveMediaStream = () => {
  if (activeMediaStream) {
    try {
      activeMediaStream.getTracks().forEach((track) => {
        track.onended = null;
        track.onmute = null;
        track.stop();
      });
    } catch (_) {}
    activeMediaStream = null;
  }
  if (typeof window !== 'undefined') {
    if (window.__candidateMediaStream) {
      try {
        window.__candidateMediaStream.getTracks().forEach((track) => {
          track.onended = null;
          track.onmute = null;
          track.stop();
        });
      } catch (_) {}
    }
    window.__candidateMediaStream = null;
  }
};

/**
 * Deep-clean and stop ALL candidate media streams (webcam, microphone, screen share, and DOM video/audio elements).
 * Ensures the browser tab's recording indicator disappears immediately upon reaching /candidate/complete (BUG-88).
 */
export const stopAllCandidateMediaStreams = () => {
  // 1. Stop tracked webcam/mic and screen streams
  stopActiveMediaStream();
  stopScreenStream();

  // 2. Clean up any extra streams stored on window object
  if (typeof window !== 'undefined') {
    const streamKeys = [
      '__candidateMediaStream',
      '__candidateScreenStream',
      '__candidateAudioStream',
      '__proctoringStream',
    ];
    streamKeys.forEach((key) => {
      const s = window[key];
      if (s && typeof s.getTracks === 'function') {
        try {
          s.getTracks().forEach((t) => {
            t.onended = null;
            t.onmute = null;
            t.stop();
          });
        } catch (_) {}
      }
      window[key] = null;
    });

    // 3. Scan DOM for any video and audio elements with active MediaStream srcObjects and stop their tracks
    if (typeof document !== 'undefined') {
      try {
        const mediaElements = document.querySelectorAll('video, audio');
        mediaElements.forEach((el) => {
          if (el.srcObject && typeof el.srcObject.getTracks === 'function') {
            try {
              el.srcObject.getTracks().forEach((t) => {
                t.onended = null;
                t.onmute = null;
                t.stop();
              });
            } catch (_) {}
            try {
              el.srcObject = null;
            } catch (_) {}
          }
        });
      } catch (_) {}
    }
  }
};
