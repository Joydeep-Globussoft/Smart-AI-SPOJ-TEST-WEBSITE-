// screenStreamManager.js — Singleton manager for candidate screen capture MediaStream (BUG-13, BUG-88)
// PRD FR-5.2, FR-5.3, Section 8.2: Screen capture MediaStream for TAB_SWITCH and FULLSCREEN_EXIT evidence.
// Re-exports from unified mediaStreamManager.js for backward compatibility.

export {
  setScreenStream,
  getScreenStream,
  stopScreenStream,
  setActiveMediaStream,
  getActiveMediaStream,
  stopActiveMediaStream,
  stopAllCandidateMediaStreams,
} from './mediaStreamManager';
