// CandidateInstructions.jsx — show test.instructions before start-attempt
// Explicitly requests and verifies mandatory Webcam AND Microphone permissions before starting (FR-5.2, BUG-08)
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import logoLight from '../../assets/logo-light.png';
import api from '../../services/apiClient';
import LoadingDots from '../../shared/LoadingDots';
import { setScreenStream, setActiveMediaStream, stopActiveMediaStream } from '../../services/mediaStreamManager';
import { verifyActiveVideoStream, checkHardwareDevices } from '../../services/mediaStreamVerifier';

export default function CandidateInstructions() {
  const navigate = useNavigate();
  const [joinData, setJoinData] = useState(null);
  const [currentStep, setCurrentStep] = useState(() => {
    return sessionStorage.getItem('instructionsStep') === '2' ? 2 : 1;
  });
  // Status states: 'UNCHECKED' | 'GRANTED' | 'NOT_FOUND' | 'DENIED'
  const [webcamStatus, setWebcamStatus] = useState('UNCHECKED');
  const [micStatus, setMicStatus] = useState('UNCHECKED');
  const [screenStatus, setScreenStatus] = useState('UNCHECKED');
  const [loading, setLoading] = useState(false);
  const [requestingPermissions, setRequestingPermissions] = useState(false);
  const [error, setError] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const webcamGranted = webcamStatus === 'GRANTED';
  const micGranted = micStatus === 'GRANTED';
  const screenGranted = screenStatus === 'GRANTED';
  const isPermissionsComplete = webcamGranted && micGranted && screenGranted;

  useEffect(() => {
    const stored = sessionStorage.getItem('joinData');
    if (!stored) {
      navigate('/candidate/join');
      return;
    }
    setJoinData(JSON.parse(stored));
  }, [navigate]);

  // Clean up media tracks when unmounting
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      stopActiveMediaStream();
    };
  }, []);

  // Listen for device changes (hardware unplug / plug events on instructions page)
  useEffect(() => {
    const handleDeviceChange = async () => {
      const { hasVideo, hasAudio } = await checkHardwareDevices();
      if (!hasVideo && webcamStatus === 'GRANTED') {
        console.warn('[Instructions] Video device disconnected via devicechange');
        setWebcamStatus('NOT_FOUND');
        if (streamRef.current) {
          streamRef.current.getVideoTracks().forEach((t) => t.stop());
        }
      }
      if (!hasAudio && micStatus === 'GRANTED') {
        console.warn('[Instructions] Audio device disconnected via devicechange');
        setMicStatus('NOT_FOUND');
      }
    };

    navigator.mediaDevices?.addEventListener('devicechange', handleDeviceChange);
    return () => navigator.mediaDevices?.removeEventListener('devicechange', handleDeviceChange);
  }, [webcamStatus, micStatus]);

  // Ensure video element receives stream whenever webcamGranted changes
  useEffect(() => {
    if (webcamGranted && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [webcamGranted]);

  // Ref callback to bind stream immediately on video mount
  const handleVideoRef = (el) => {
    videoRef.current = el;
    if (el && streamRef.current && webcamGranted) {
      el.srcObject = streamRef.current;
    }
  };

  // FR-5.2: Mandatory Webcam, Mic, and Screen Sharing permission & device check (BUG-08, BUG-13, BUG-42)
  const requestMediaPermissions = async () => {
    setError('');
    setRequestingPermissions(true);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('Your browser does not support media access. Please use modern Chrome or Edge.');
      setRequestingPermissions(false);
      return;
    }

    try {
      // 0. Hardware device presence check
      const { hasVideo, hasAudio } = await checkHardwareDevices();

      // 1. Verify Webcam
      let currentWebcamGranted = webcamGranted;
      if (!currentWebcamGranted) {
        if (!hasVideo) {
          setWebcamStatus('NOT_FOUND');
          setError('No webcam detected on your system. Please connect a physical camera and try again.');
          setRequestingPermissions(false);
          return;
        }

        try {
          const videoStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 480 } },
          });

          const videoTracks = videoStream.getVideoTracks();
          if (!videoTracks || videoTracks.length === 0 || videoTracks[0].readyState !== 'live') {
            throw new Error('No live video track returned from camera.');
          }

          // Verify that the camera feed is actively delivering live frames (not a static placeholder like Iriun cat)
          const feedHealth = await verifyActiveVideoStream(videoStream, 1500);
          if (!feedHealth.ok) {
            videoTracks.forEach((t) => t.stop());
            setWebcamStatus('NOT_FOUND');
            if (feedHealth.reason === 'STATIC_PLACEHOLDER') {
              setError('No active camera feed detected. Your camera driver appears idle or disconnected (e.g. phone not connected to Iriun). Please connect a physical camera and try again.');
            } else {
              setError('Camera feed is not transmitting video frames. Please check your camera connection and try again.');
            }
            setRequestingPermissions(false);
            return;
          }

          streamRef.current = videoStream;
          setActiveMediaStream(videoStream);
          setWebcamStatus('GRANTED');
          currentWebcamGranted = true;

          videoTracks[0].onended = () => {
            console.warn('[Instructions] Video track ended');
            setWebcamStatus('NOT_FOUND');
            if (streamRef.current) {
              streamRef.current.getTracks().forEach((t) => t.stop());
              streamRef.current = null;
            }
          };
        } catch (vErr) {
          console.warn('[Instructions] Video access error:', vErr);
          if (vErr.name === 'NotFoundError' || vErr.name === 'DevicesNotFoundError') {
            setWebcamStatus('NOT_FOUND');
            setError('No webcam detected. Please connect a working camera and try again.');
          } else if (vErr.name === 'NotAllowedError' || vErr.name === 'PermissionDeniedError') {
            setWebcamStatus('DENIED');
            setError('Webcam permission was denied. Please allow camera access in your browser settings and try again.');
          } else if (vErr.name === 'NotReadableError' || vErr.name === 'TrackStartError') {
            setWebcamStatus('NOT_FOUND');
            setError('Camera is already in use by another application. Please close other applications and try again.');
          } else {
            setWebcamStatus('NOT_FOUND');
            setError(vErr.message || 'Failed to access webcam.');
          }
          setRequestingPermissions(false);
          return;
        }
      }

      // 2. Verify Microphone
      let currentMicGranted = micGranted;
      if (!currentMicGranted) {
        if (!hasAudio) {
          setMicStatus('NOT_FOUND');
          setError('No microphone detected on your system. Please connect a microphone and try again.');
          setRequestingPermissions(false);
          return;
        }

        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const audioTracks = audioStream.getAudioTracks();
          if (!audioTracks || audioTracks.length === 0 || audioTracks[0].readyState !== 'live') {
            throw new Error('No live audio track returned from microphone.');
          }

          setMicStatus('GRANTED');
          currentMicGranted = true;

          audioTracks[0].onended = () => {
            console.warn('[Instructions] Audio track ended');
            setMicStatus('NOT_FOUND');
          };

          // Combine audio track into streamRef for clean unmounting
          if (streamRef.current) {
            audioTracks.forEach((t) => streamRef.current.addTrack(t));
          }
        } catch (aErr) {
          console.warn('[Instructions] Audio access error:', aErr);
          if (aErr.name === 'NotFoundError' || aErr.name === 'DevicesNotFoundError') {
            setMicStatus('NOT_FOUND');
            setError('No microphone detected. Please connect a working microphone and try again.');
          } else if (aErr.name === 'NotAllowedError' || aErr.name === 'PermissionDeniedError') {
            setMicStatus('DENIED');
            setError('Microphone permission was denied. Please allow microphone access in your browser settings and try again.');
          } else if (aErr.name === 'NotReadableError' || aErr.name === 'TrackStartError') {
            setMicStatus('NOT_FOUND');
            setError('Microphone is already in use by another application. Please close other applications and try again.');
          } else {
            setMicStatus('NOT_FOUND');
            setError(aErr.message || 'Failed to access microphone.');
          }
          setRequestingPermissions(false);
          return;
        }
      }

      // 3. Verify Screen Sharing
      let currentScreenGranted = screenGranted;
      if (!currentScreenGranted) {
        if (!navigator.mediaDevices.getDisplayMedia) {
          setError('Your browser does not support screen proctoring. Please use modern Chrome or Edge.');
          setRequestingPermissions(false);
          return;
        }

        toast('Please select "Entire Screen" in the browser prompt to allow proctoring verification.', {
          icon: '🖥️',
          duration: 5000,
        });

        try {
          const screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
              displaySurface: 'monitor',
              cursor: 'always',
            },
            audio: false,
            selfBrowserSurface: 'exclude',
            surfaceSwitching: 'include',
            systemAudio: 'exclude',
          });

          const screenTracks = screenStream.getVideoTracks();
          const hasScreen = screenTracks.length > 0 && screenTracks[0].readyState === 'live';

          if (hasScreen) {
            const trackSettings = screenTracks[0].getSettings();
            const surface = trackSettings.displaySurface;

            if (surface && surface !== 'monitor') {
              screenTracks[0].stop();
              setScreenStream(null);
              setScreenStatus('DENIED');
              const msg = 'Invalid Selection: You selected a single browser tab or window. For anti-cheating proctoring compliance, you MUST select "Entire Screen". Click "Grant Permissions" and select the "Entire Screen" tab.';
              setError(msg);
              toast.error(msg, { duration: 7000 });
              setRequestingPermissions(false);
              return;
            }

            setScreenStream(screenStream);
            setScreenStatus('GRANTED');
            currentScreenGranted = true;

            screenTracks[0].onended = () => {
              setScreenStatus('DENIED');
              setScreenStream(null);
              toast.error('Screen sharing was stopped. Please grant screen sharing to proceed.');
            };
          }
        } catch (sErr) {
          console.warn('[Instructions] Screen share error:', sErr);
          setScreenStatus('DENIED');
          if (sErr.name === 'NotAllowedError' || sErr.name === 'PermissionDeniedError') {
            setError('Screen sharing permission was cancelled or denied. Entire Screen sharing is mandatory to take this test.');
          } else {
            setError('Screen sharing failed. Please try clicking Grant Permissions again.');
          }
          setRequestingPermissions(false);
          return;
        }
      }

      if (currentWebcamGranted && currentMicGranted && currentScreenGranted) {
        setError('');
        toast.success('Camera, Microphone, and Screen Sharing verified!');
      }
    } catch (err) {
      console.error('Media permission error:', err);
      setError('An unexpected error occurred while verifying devices. Please try again.');
    } finally {
      setRequestingPermissions(false);
    }
  };

  const handleStartTest = async () => {
    // Strict requirement: Block start action until camera, mic, and screen permissions are granted (BUG-13)
    if (!webcamGranted || !micGranted || !screenGranted) {
      setError('Camera, microphone, and screen sharing permissions must all be granted before starting the test (FR-5.2).');
      return;
    }

    setLoading(true);
    try {
      // FR-5.2: Enter fullscreen before starting
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }

      // Engage Keyboard Lock API immediately upon entering fullscreen (restricts Alt+Tab, Escape, Meta)
      if ('keyboard' in navigator && typeof navigator.keyboard.lock === 'function') {
        try {
          await navigator.keyboard.lock();
          console.log('[Instructions] Keyboard lock engaged (Alt+Tab restricted)');
        } catch (kErr) {
          console.warn('[Instructions] Keyboard lock failed:', kErr);
        }
      }

      // POST /tests/:testId/start-attempt (§9.5)
      const { data } = await api.startAttempt(joinData.test._id, { roomId: joinData.room._id });

      // Stop instruction preview stream before test screen initializes proctoring
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      stopActiveMediaStream();

      // Store session data for the test screen
      sessionStorage.setItem(
        'testSession',
        JSON.stringify({
          test: joinData.test,
          room: joinData.room,
          questions: data.questions,
          submissions: data.submissions || [],
          candidateStartTime: data.candidateStartTime,
          candidateEndTime: data.candidateEndTime,
          submissionSessionId: data.submissionSessionId,
        })
      );
      sessionStorage.removeItem('instructionsStep');

      // Navigate based on test type
      if (joinData.test.testType === 'AI_TEST') {
        navigate('/candidate/ai-test');
      } else {
        navigate('/candidate/test');
      }
    } catch (err) {
      console.error('[Instructions] Start test error:', JSON.stringify(err.response?.data) || err.message);
      setError(err.response?.data?.error || 'Failed to start test attempt');
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    } finally {
      setLoading(false);
    }
  };

  if (!joinData) return null;

  return (
    <div className="app-layout" style={{ height: '100vh', background: 'var(--color-bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Top Banner Header */}
      <div style={{ background: '#1A2B3C', padding: '14px 32px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <img
          src={logoLight}
          alt="Globussoft Technology"
          style={{ height: 38, width: 'auto', objectFit: 'contain', display: 'block' }}
        />
      </div>

      <div className="instructions-scroll-container" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '32px 24px', maxWidth: 960, margin: '0 auto', width: '100%', scrollbarGutter: 'stable' }}>
        {currentStep === 1 ? (
          /* ── PAGE 1: Instructions & Rules ── */
          <div style={{ maxWidth: 840, margin: '0 auto', width: '100%' }}>
            <div
              className="card"
              style={{
                background: 'var(--color-bg-card)',
                borderRadius: 14,
                padding: '32px 36px',
                border: '1px solid var(--color-border)',
                boxShadow: 'var(--shadow-md)',
              }}
            >
              {/* Test Instructions Section */}
              <div style={{ marginBottom: 28 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      background: 'rgba(14, 124, 134, 0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.25rem',
                      flexShrink: 0,
                    }}
                  >
                    📋
                  </div>
                  <h2
                    className="card-title"
                    style={{
                      fontSize: '1.3rem',
                      fontWeight: 800,
                      color: '#1A2B3C',
                      margin: 0,
                      letterSpacing: '-0.01em',
                    }}
                  >
                    Test Instructions
                  </h2>
                </div>

                {(() => {
                  const rawInstructions = joinData?.instructions || '';
                  const lines = String(rawInstructions)
                    .split(/\r?\n|<br\s*\/?>/gi)
                    .map((l) => l.replace(/<[^>]*>?/gm, '').trim())
                    .filter((l) => l.length > 0)
                    .map((line) => line.replace(/^\s*(\d+[\.\)\-:]|\([0-9]+\))\s*/, '').trim() || line);

                  if (lines.length === 0) {
                    return (
                      <p style={{ color: '#64748B', fontSize: '0.9rem', margin: 0, fontStyle: 'italic' }}>
                        No specific instructions provided. Follow general test guidelines.
                      </p>
                    );
                  }

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      {lines.map((itemText, idx) => (
                        <div
                          key={idx}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 14,
                          }}
                        >
                          <div
                            style={{
                              width: 26,
                              height: 26,
                              minWidth: 26,
                              borderRadius: 6,
                              background: 'rgba(14, 124, 134, 0.12)',
                              border: '1px solid rgba(14, 124, 134, 0.3)',
                              color: '#0E7C86',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '0.82rem',
                              fontWeight: 700,
                              flexShrink: 0,
                              marginTop: 1,
                            }}
                          >
                            {idx + 1}
                          </div>
                          <div
                            style={{
                              fontSize: '0.92rem',
                              color: '#334155',
                              lineHeight: 1.6,
                              fontWeight: 500,
                              paddingTop: 1,
                            }}
                          >
                            {itemText}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {/* Mandatory Proctoring Rules Section with subtle warning tint */}
              <div
                style={{
                  background: '#FFF8F6',
                  border: '1px solid #FFE4DE',
                  borderRadius: 10,
                  padding: '20px 24px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>⚠️</span>
                  <h3
                    style={{
                      fontSize: '1.05rem',
                      fontWeight: 700,
                      color: '#991B1B',
                      margin: 0,
                      letterSpacing: '-0.01em',
                    }}
                  >
                    Mandatory Proctoring Rules
                  </h3>
                </div>

                <ul
                  style={{
                    listStyle: 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                    paddingLeft: 0,
                    margin: 0,
                  }}
                >
                  {[
                    'Stay in fullscreen mode throughout the test. Exiting fullscreen will be logged as a violation.',
                    'Alt+Tab and window switching are disabled. Leaving or defocusing the test window is logged with proof.',
                    'Do not switch tabs or minimize the browser window. Tab switches are logged with proof.',
                    'Do not use your mobile phone. Automated AI phone detection is active.',
                    'Copy-paste and context menus are disabled.',
                    'Your webcam and microphone must remain active and unobstructed at all times.',
                    'The test will automatically submit when your countdown timer expires.',
                  ].map((rule, i) => (
                    <li
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 12,
                        fontSize: '0.88rem',
                        color: '#7F1D1D',
                        lineHeight: 1.55,
                        fontWeight: 500,
                      }}
                    >
                      <div
                        style={{
                          width: 20,
                          height: 20,
                          minWidth: 20,
                          borderRadius: '50%',
                          background: '#FEE2E2',
                          border: '1px solid #FCA5A5',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          marginTop: 2,
                        }}
                      >
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#DC2626"
                          strokeWidth="3.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <line x1="18" y1="6" x2="6" y2="18"></line>
                          <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                      </div>
                      <span>{rule}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Next Step Navigation Action */}
            <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                id="next-step-btn"
                type="button"
                className="btn btn-primary btn-lg"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '12px 32px',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
                onClick={() => {
                  setCurrentStep(2);
                  sessionStorage.setItem('instructionsStep', '2');
                  const sc = document.querySelector('.instructions-scroll-container');
                  if (sc) sc.scrollTop = 0;
                }}
              >
                <span>Next</span>
                <span style={{ fontSize: '1.15rem', lineHeight: 1 }}>→</span>
              </button>
            </div>
          </div>
        ) : (
          /* ── PAGE 2: Permissions & Start ── */
          <div style={{ maxWidth: 840, margin: '0 auto', width: '100%' }}>
            {/* Back Button */}
            <div style={{ marginBottom: 16 }}>
              <button
                id="back-step-btn"
                type="button"
                className="btn btn-outline"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 14px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: '#4B5563',
                  background: '#FFFFFF',
                  border: '1px solid #D1D5DB',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
                onClick={() => {
                  setCurrentStep(1);
                  sessionStorage.setItem('instructionsStep', '1');
                  const sc = document.querySelector('.instructions-scroll-container');
                  if (sc) sc.scrollTop = 0;
                }}
              >
                <span style={{ fontSize: '1rem', lineHeight: 1 }}>←</span>
                <span>Back to Instructions &amp; Rules</span>
              </button>
            </div>

            {/* ── Header Section (FEATURE-017: Option B Restructure) ── */}
            <div
              className="instructions-header-block card"
              style={{
                background: '#FFFFFF',
                borderRadius: 12,
                padding: '24px 28px',
                border: '1px solid #E5E7EB',
                borderLeft: '5px solid var(--color-primary, #0E7C86)',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
                marginBottom: 24,
              }}
            >
              {/* Overline Test Type Badge */}
              <div style={{ marginBottom: 6 }}>
                <span
                  className="badge badge-teal"
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    padding: '3px 10px',
                    borderRadius: 6,
                  }}
                >
                  {joinData.test?.testType || 'TEST'}
                </span>
              </div>

              {/* Test Title */}
              <h1
                style={{
                  fontSize: '1.85rem',
                  fontWeight: 800,
                  color: '#1A2B3C',
                  margin: '0 0 18px 0',
                  lineHeight: 1.25,
                  letterSpacing: '-0.02em',
                }}
              >
                {joinData.test?.title || 'Test Instructions'}
              </h1>

              {/* Horizontal Mini Stat Blocks */}
              <div
                className="instructions-stat-blocks-row"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: 12,
                }}
              >
                {/* Stat 1: Duration */}
                <div
                  className="stat-block-item"
                  style={{
                    background: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: 8,
                    padding: '10px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 3,
                    minWidth: 0,
                  }}
                >
                  <div style={{ fontSize: '1.2rem', lineHeight: 1 }}>⏱️</div>
                  <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    Duration
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {joinData.test?.durationMinutes ?? 90} minutes
                  </div>
                </div>

                {/* Stat 2: Total Questions */}
                <div
                  className="stat-block-item"
                  style={{
                    background: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: 8,
                    padding: '10px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 3,
                    minWidth: 0,
                  }}
                >
                  <div style={{ fontSize: '1.2rem', lineHeight: 1 }}>📄</div>
                  <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    Total Questions
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {joinData.test?.totalQuestions ?? 0}
                  </div>
                </div>

                {/* Stat 3: Passing Criteria */}
                <div
                  className="stat-block-item"
                  style={{
                    background: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: 8,
                    padding: '10px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 3,
                    minWidth: 0,
                  }}
                >
                  <div style={{ fontSize: '1.2rem', lineHeight: 1 }}>✅</div>
                  <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    Passing Criteria
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    ≥ {joinData.test?.passingCriteria !== undefined && joinData.test?.passingCriteria !== null ? joinData.test.passingCriteria : 1} Qs
                  </div>
                </div>

                {/* Stat 4: Room */}
                <div
                  className="stat-block-item"
                  style={{
                    background: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: 8,
                    padding: '10px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 3,
                    minWidth: 0,
                  }}
                >
                  <div style={{ fontSize: '1.2rem', lineHeight: 1 }}>🏠</div>
                  <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    Room
                  </div>
                  <div
                    style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                    title={joinData.room?.roomName || joinData.room?.roomCode}
                  >
                    {joinData.room?.roomName || joinData.room?.roomCode || 'Assigned Room'}
                  </div>
                </div>
              </div>
            </div>

            {/* Device Permissions & Start Panel */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 24 }}>
              {/* Device Permissions Card */}
              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">📸 Device Permissions (FR-5.2)</h3>
                </div>
                <div
                  style={{
                    width: '100%',
                    aspectRatio: '4/3',
                    background: '#1A2B3C',
                    borderRadius: 8,
                    overflow: 'hidden',
                    marginBottom: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                  }}
                >
                  {webcamGranted ? (
                    <video
                      ref={handleVideoRef}
                      autoPlay
                      muted
                      playsInline
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)', padding: '16px 12px' }}>
                      <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>📷</div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>
                        {webcamStatus === 'NOT_FOUND' ? 'No Webcam Detected' : 'Webcam Not Connected'}
                      </div>
                      <div style={{ fontSize: '0.72rem', marginTop: 4, color: 'rgba(255,255,255,0.45)' }}>
                        Connect a physical camera and click "Grant Permissions"
                      </div>
                    </div>
                  )}
                  {webcamGranted && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        background: '#2ECC71',
                        borderRadius: 4,
                        padding: '2px 8px',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        color: 'white',
                      }}
                    >
                      ● LIVE PREVIEW
                    </div>
                  )}
                </div>

                {/* Status Indicators for Webcam, Mic & Screen */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ color: '#4b5563' }}>Webcam:</span>
                    <span style={{ fontWeight: 600, color: webcamGranted ? '#2ECC71' : '#E74C3C' }}>
                      {webcamStatus === 'GRANTED'
                        ? '✓ Granted'
                        : webcamStatus === 'NOT_FOUND'
                        ? '✗ No Camera Found'
                        : '✗ Not Granted'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ color: '#4b5563' }}>Microphone:</span>
                    <span style={{ fontWeight: 600, color: micGranted ? '#2ECC71' : '#E74C3C' }}>
                      {micStatus === 'GRANTED'
                        ? '✓ Granted'
                        : micStatus === 'NOT_FOUND'
                        ? '✗ No Mic Found'
                        : '✗ Not Granted'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ color: '#4b5563' }}>Screen Share:</span>
                    <span style={{ fontWeight: 600, color: screenGranted ? '#2ECC71' : '#E74C3C' }}>
                      {screenStatus === 'GRANTED' ? '✓ Granted' : '✗ Not Granted'}
                    </span>
                  </div>
                </div>

                <div style={{ fontSize: '0.74rem', color: '#64748b', marginBottom: 12, lineHeight: 1.4, background: '#f8fafc', padding: '8px 10px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                  ℹ️ <strong>Screen sharing is required</strong> so violations like tab-switching and exiting fullscreen can be verified.
                </div>

                {!isPermissionsComplete ? (
                  <button
                    id="grant-media-btn"
                    className="btn btn-secondary"
                    style={{
                      width: '100%',
                      fontWeight: 600,
                      fontSize: '0.8rem',
                      padding: '10px 8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      whiteSpace: 'normal',
                      lineHeight: 1.3,
                      boxSizing: 'border-box',
                      overflow: 'hidden',
                    }}
                    onClick={requestMediaPermissions}
                    disabled={requestingPermissions}
                  >
                    {requestingPermissions ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <LoadingDots size="xs" />
                        <span>Requesting Permissions...</span>
                      </span>
                    ) : (
                      <>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            flexShrink: 0,
                            fontSize: '0.95rem',
                            lineHeight: 1,
                          }}
                        >
                          <span>📷</span>
                          <span>🖥️</span>
                        </span>
                        <span style={{ display: 'inline', textAlign: 'center' }}>
                          Grant Camera, Mic &amp; Screen Access
                        </span>
                      </>
                    )}
                  </button>
                ) : (
                  <div className="alert alert-success" style={{ margin: 0, fontSize: '0.8rem' }}>
                    ✅ Devices &amp; Screen verified — ready to begin!
                  </div>
                )}
              </div>

              {/* Start Test Card */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {error && (
                  <div className="alert alert-danger" id="instructions-error-alert" style={{ fontSize: '0.85rem', lineHeight: 1.5 }}>
                    {error.includes('active exam') ? `⚠️ ${error}` : error}
                  </div>
                )}

                <div className="card" style={{ background: '#1A2B3C', borderColor: '#1A2B3C' }}>
                  <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', marginBottom: 12 }}>
                    Clicking Start will initiate your timer and lock the browser in full-screen mode.
                  </div>
                  <button
                    id="start-test-btn"
                    className="btn btn-primary btn-lg"
                    style={{ width: '100%' }}
                    onClick={handleStartTest}
                    disabled={loading || !isPermissionsComplete}
                  >
                    {loading ? (
                      <>
                        <LoadingDots size="sm" color="white" /> Starting test...
                      </>
                    ) : (
                      '🚀 Start Test — Enter Fullscreen'
                    )}
                  </button>
                  {!isPermissionsComplete && (
                    <p style={{ color: '#f87171', fontSize: '0.75rem', textAlign: 'center', marginTop: 8 }}>
                      🔒 Camera, Mic &amp; Screen access must be granted to start
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
