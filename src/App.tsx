import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  PhoneCall,
  PhoneOff,
  Volume2,
  VolumeX,
  Zap,
  HelpCircle,
  Settings2,
  Sparkles,
  Send,
  MessageSquare,
  Radio,
  Cpu,
  ChevronDown,
  Layers,
  Activity,
  AlertCircle,
  RefreshCw,
  Eye,
  Gauge,
  Sliders,
  BookOpen,
  GraduationCap,
} from 'lucide-react';
import { LiveAudioPlayer, LiveAudioRecorder } from './utils/audio.ts';
import { AudioOrb } from './components/AudioOrb.tsx';
import { VoiceSelector, VOICES } from './components/VoiceSelector.tsx';
import { TranscriptView, TranscriptItem } from './components/TranscriptView.tsx';
import { getSavedBackendHost, cleanBackendHost, getWsUrl } from './utils/backendConfig.ts';
import { conversationStateMachine } from './utils/conversationStateMachine.ts';
import type { TeachingContextSummary, ConversationState, TeachingMode } from './types/conversation.ts';
import {
  NON_STOP_TEACHING_SYSTEM_RULE,
  SHREYA_MAAM_PROMPT,
  BHATTACHARYA_SIR_PROMPT,
  SARMAD_MEHRAJ_SIR_PROMPT,
  MRUNAL_PATEL_SIR_PROMPT,
  SUDARSHAN_GURJAR_SIR_PROMPT,
  DR_SENGUPTA_PROMPT,
  ADHIKARI_SIR_PROMPT,
  WBBSE_HISTORY_PROMPT,
  WBBSE_SCIENCE_PROMPT,
  WBBSE_GEOGRAPHY_PROMPT,
} from './data/teacherPersonas.ts';

type CallStatus = 'idle' | 'connecting' | 'active' | 'speaking' | 'listening' | 'interrupted';

export default function App() {
  // Session & Connection State
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [model, setModel] = useState<'gemini-3.8-live' | 'gemini-3.8-live-extended-thinking'>('gemini-3.8-live');
  const [voice, setVoice] = useState<string>('Kore');
  const [systemInstruction, setSystemInstruction] = useState<string>(WBBSE_SCIENCE_PROMPT);
  const [backendHost] = useState<string>(() => getSavedBackendHost());

  // Conversation State Machine & Active Topic Context
  const [activeContext, setActiveContext] = useState<TeachingContextSummary>(() => conversationStateMachine.getContext());
  const [convState, setConvState] = useState<ConversationState>(() => conversationStateMachine.getState());

  // Interactive Class & Mode Selection ("আলোচনা", "AI কে প্রশ্ন", "প্রশ্ন উত্তর")
  const [selectedClass, setSelectedClass] = useState<string>('Class 10');
  const [selectedWbbseSubject, setSelectedWbbseSubject] = useState<'science' | 'history' | 'geography'>('science');
  const [selectedCompetitiveSubject, setSelectedCompetitiveSubject] = useState<string>('Spoken English');
  const [activeSection, setActiveSection] = useState<'wbbse' | 'competitive'>('wbbse');
  const [teachingMode, setTeachingModeState] = useState<TeachingMode>('lecture');

  useEffect(() => {
    const unsubscribe = conversationStateMachine.subscribe((context, state) => {
      setActiveContext({ ...context });
      setConvState(state);
    });
    return unsubscribe;
  }, []);

  // Audio & Video State
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [isScreenEnabled, setIsScreenEnabled] = useState(false);
  const [userVolume, setUserVolume] = useState(0);
  const [aiVolume, setAiVolume] = useState(0);

  // Speed & Sensitivity Controls
  const [speechSpeed, setSpeechSpeed] = useState<number>(1.0);
  const [micSensitivity, setMicSensitivity] = useState<number>(50); // Balanced 50% for realistic voice pickup
  const [echoShieldEnabled, setEchoShieldEnabled] = useState<boolean>(true); // Acoustic Echo Shield to prevent AI self-interruption
  const [silenceWait, setSilenceWait] = useState<number>(0.75); // Fast turn completion in 750ms

  // Telemetry & UI
  const [callDuration, setCallDuration] = useState(0);
  const [chunksReceived, setChunksReceived] = useState(0);
  const [statusMessage, setStatusMessage] = useState('Ready to connect');
  const [showSettings, setShowSettings] = useState(false);
  const [showMobileTranscript, setShowMobileTranscript] = useState(false);
  const [typedMessage, setTypedMessage] = useState('');
  const [transcripts, setTranscripts] = useState<TranscriptItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Audio References
  const audioPlayerRef = useRef<LiveAudioPlayer | null>(null);
  const audioRecorderRef = useRef<LiveAudioRecorder | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const videoIntervalRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const meterIntervalRef = useRef<number | null>(null);
  const callStatusRef = useRef<CallStatus>(callStatus);
  const lastResumptionHandleRef = useRef<string | null>(null);
  const inactivityTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    callStatusRef.current = callStatus;
  }, [callStatus]);

  // Sync speech speed dynamically
  useEffect(() => {
    audioPlayerRef.current?.setPlaybackRate(speechSpeed);
  }, [speechSpeed]);

  // Sync mic sensitivity dynamically
  useEffect(() => {
    audioRecorderRef.current?.setSensitivity(micSensitivity);
  }, [micSensitivity]);

  // Sync echo shield dynamically
  useEffect(() => {
    audioRecorderRef.current?.setEchoGuardEnabled(echoShieldEnabled);
  }, [echoShieldEnabled]);

  // Sync silence wait timeout dynamically
  useEffect(() => {
    audioRecorderRef.current?.setSilenceWaitMs(Math.round(silenceWait * 1000));
  }, [silenceWait]);

  // Initialize Audio Player and Subscribe to State Machine on mount
  useEffect(() => {
    audioPlayerRef.current = new LiveAudioPlayer();
    audioPlayerRef.current.setPlaybackRate(speechSpeed);
    audioRecorderRef.current = new LiveAudioRecorder();
    audioRecorderRef.current.setSensitivity(micSensitivity);
    audioRecorderRef.current.setSilenceWaitMs(Math.round(silenceWait * 1000));
    audioRecorderRef.current.setEchoGuardEnabled(echoShieldEnabled);
    audioRecorderRef.current.setAiSpeakingCallback(() => {
      return audioPlayerRef.current?.isPlaying() || false;
    });

    // Subscribe to state machine for real-time topic updates next to Voice indicator
    const unsubscribe = conversationStateMachine.subscribe((ctx) => {
      setActiveContext(ctx);
    });

    return () => {
      unsubscribe();
      stopCall();
      audioPlayerRef.current?.close();
      audioRecorderRef.current?.stop();
    };
  }, []);

  // Format call timer
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  // Add transcript entry helper
  const addTranscript = useCallback((sender: 'user' | 'gemini' | 'tool' | 'system', text: string, extra?: any) => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    setTranscripts((prev) => {
      return [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          sender,
          text,
          timestamp: timeStr,
          toolDetails: extra?.toolDetails,
          isInterrupted: extra?.isInterrupted,
        },
      ];
    });
  }, []);

  // Clear silence / inactivity auto-disconnect timer
  const clearInactivityTimer = useCallback(() => {
    if (inactivityTimeoutRef.current) {
      window.clearTimeout(inactivityTimeoutRef.current);
      inactivityTimeoutRef.current = null;
    }
  }, []);

  // Arm inactivity auto-disconnect timer (5 minutes safeguard so mute/typing students never get cut off)
  const armInactivityTimer = useCallback((delayMs = 300000) => {
    clearInactivityTimer();
    inactivityTimeoutRef.current = window.setTimeout(() => {
      if (callStatusRef.current !== 'idle') {
        stopCall();
        setStatusMessage('দীর্ঘক্ষণ সাড়া না পাওয়ায় কল বিচ্ছিন্ন হয়েছে');
        setErrorMessage('ছাত্রের দীর্ঘক্ষণ কোনো সাড়া না পাওয়ায় AI কোটা সংরক্ষণের জন্য কলটি ডিসকানেক্ট করা হয়েছে।');
        addTranscript('system', 'দীর্ঘক্ষণ কোনো কথোপকথন না হওয়ায় কলটি স্বয়ংক্রিয়ভাবে ডিসকানেক্ট করা হলো।');
      }
    }, delayMs);
  }, [clearInactivityTimer]);

  // Seamless Session Renewal
  const renewSession = useCallback(() => {
    if (callStatusRef.current === 'idle') return;
    setStatusMessage('Seamlessly renewing voice session...');
    startCall(true);
  }, []);

  // Start Call Handler
  const startCall = async (isAutoRenew = false) => {
    if (isAutoRenew && !conversationStateMachine.acquireReconnectLock()) {
      console.log('[App] Reconnect already in progress, avoiding duplicate connect');
      return;
    }

    // CRITICAL: When user initiates a fresh call, discard old session resume token so the selected subject/persona starts clean!
    if (!isAutoRenew) {
      lastResumptionHandleRef.current = null;
      conversationStateMachine.setResumptionHandle(null);
    }

    setErrorMessage(null);
    setCallStatus(isAutoRenew ? 'active' : 'connecting');
    setStatusMessage(isAutoRenew ? 'Refreshing connection...' : 'Initiating audio session & WebSocket...');
    if (!isAutoRenew) {
      setCallDuration(0);
      setChunksReceived(0);
    }

    // Cleanly detach old socket so its onclose doesn't fire
    if (wsRef.current) {
      try {
        wsRef.current.onclose = null;
        wsRef.current.close();
      } catch (e) {}
      wsRef.current = null;
    }

    try {
      // 1. Initialize audio player
      audioPlayerRef.current?.init();

      // 2. Connect WebSocket to server
      let wsHost = cleanBackendHost(backendHost) || getSavedBackendHost();
      if (!wsHost && typeof window !== 'undefined') {
        const hostname = window.location.hostname;
        if (
          hostname === 'localhost' ||
          hostname === '127.0.0.1' ||
          hostname.includes('run.app') ||
          hostname.includes('onrender.com') ||
          hostname.includes('railway.app')
        ) {
          wsHost = window.location.host;
        }
      }

      if (!wsHost) {
        conversationStateMachine.releaseReconnectLock();
        setCallStatus('idle');
        setStatusMessage('Backend connecting...');
        setErrorMessage('লাইভ ভয়েস ব্যাকএন্ডের সাথে সংযোগ স্থাপন করা যাচ্ছে না। অনুগ্রহ করে কিছুক্ষণ পর চেষ্টা করুন।');
        return;
      }

      const isLocal = wsHost.includes('localhost') || wsHost.includes('127.0.0.1');
      const protocol = isLocal ? 'ws:' : 'wss:';
      const wsUrl = `${protocol}//${wsHost}/live-ws`;

      setStatusMessage('Connecting...');
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatusMessage('Connecting to Live Voice stream...');
        const speedInstruction = speechSpeed !== 1.0
          ? `\nSpeaking Pace: Please speak at an overall ${speechSpeed > 1.0 ? 'slightly brisk' : 'relaxed/slower'} speaking pace (${speechSpeed}x speed).`
          : '';
        const durableInstruction = conversationStateMachine.generateDurableContextInstruction();
        const baseRule = systemInstruction.includes('NON-STOP CONTINUOUS TEACHING')
          ? systemInstruction
          : `${systemInstruction}\n\n${NON_STOP_TEACHING_SYSTEM_RULE}`;
        const effectiveInstruction = `${baseRule}${speedInstruction}${durableInstruction ? `\n\n${durableInstruction}` : ''}`;

        // Dispatch session start config: resume token is ONLY sent during seamless auto-renewal!
        const effectiveResumeToken = isAutoRenew
          ? (lastResumptionHandleRef.current || conversationStateMachine.getResumptionHandle() || undefined)
          : undefined;

        ws.send(
          JSON.stringify({
            type: 'start',
            model,
            voice,
            systemInstruction: effectiveInstruction,
            resumeHandle: effectiveResumeToken,
            contextSummary: conversationStateMachine.getContext(),
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'heartbeat') {
            return;
          }

          if (msg.type === 'resumption_update' && msg.handle) {
            lastResumptionHandleRef.current = msg.handle;
            conversationStateMachine.setResumptionHandle(msg.handle);
            return;
          }

          if (msg.type === 'go_away') {
            setStatusMessage(`Server cycle warning (Time left: ${msg.timeLeft || '60s'}). Auto-resuming...`);
            return;
          }

          if (msg.type === 'session_timeout') {
            if (msg.handle) {
              lastResumptionHandleRef.current = msg.handle;
              conversationStateMachine.setResumptionHandle(msg.handle);
            }
            setStatusMessage('Session cycle completed. Resuming conversation...');
            renewSession();
            return;
          }

          if (msg.type === 'status') {
            if (msg.status === 'renewing') {
              setStatusMessage('Refreshing cloud connection seamlessly...');
              return;
            }

            if (msg.status === 'active') {
              conversationStateMachine.releaseReconnectLock();
              conversationStateMachine.transitionTo('READY');
              setCallStatus('active');
              setStatusMessage('Live conversation active. Speak freely!');
              if (msg.resumptionHandle) {
                lastResumptionHandleRef.current = msg.resumptionHandle;
                conversationStateMachine.setResumptionHandle(msg.resumptionHandle);
              }
              if (!isAutoRenew) {
                addTranscript('system', `Connected to ${model} with voice '${voice}'`);
              }

              // Connect microphone (keeps active stream uninterrupted!)
              startMicrophone();

              // Call Duration Timer (pure timer counter)
              if (!timerIntervalRef.current) {
                timerIntervalRef.current = window.setInterval(() => {
                  setCallDuration((prev) => prev + 1);
                }, 1000);
              }

              // Volume Meter Polling
              if (!meterIntervalRef.current) {
                meterIntervalRef.current = window.setInterval(() => {
                  const uVol = audioRecorderRef.current?.getVolumeLevel() || 0;
                  const aVol = audioPlayerRef.current?.getVolumeLevel() || 0;
                  setUserVolume(uVol);
                  setAiVolume(aVol);

                  // Update status dynamically
                  if (aVol > 0.05) {
                    setCallStatus('speaking');
                  } else if (uVol > 0.05) {
                    setCallStatus('listening');
                  } else {
                    setCallStatus('active');
                  }
                }, 80);
              }
            } else if (msg.status === 'idle') {
              stopCall();
            }
          }

          if (msg.type === 'audio' && msg.data) {
            clearInactivityTimer();
            conversationStateMachine.transitionTo('TEACHING');
            setChunksReceived((c) => c + 1);
            audioPlayerRef.current?.playChunk(msg.data);
          }

          if (msg.type === 'model_transcript' && msg.text) {
            // Append model speech transcript and update state machine
            addTranscript('gemini', msg.text);
            conversationStateMachine.processModelOutput(msg.text);
          }

          if (msg.type === 'user_transcript' && msg.text) {
            // Student audio transcription from Gemini Live
            addTranscript('user', msg.text);
            conversationStateMachine.processStudentInput(msg.text);
          }

          if (msg.type === 'tool_call') {
            addTranscript('tool', `Executed ${msg.name}`, {
              toolDetails: {
                name: msg.name,
                args: msg.args,
                result: msg.result,
              },
            });
          }

          if (msg.type === 'interrupted') {
            clearInactivityTimer();
            const userWasActuallySpeaking = !isMicMuted && !!audioRecorderRef.current?.isSpeaking();
            if (userWasActuallySpeaking) {
              audioPlayerRef.current?.stopAndClear();
              conversationStateMachine.transitionTo('PROCESSING_INPUT');
              setCallStatus('interrupted');
              setStatusMessage('Interrupted. Listening to you...');
              addTranscript('system', 'AI interrupted by user');
              setTimeout(() => setCallStatus('active'), 1200);
            } else {
              // Spurious server interruption while user is silent or mic is muted.
              // Do NOT dump the audio buffer so the AI voice plays completely without cutting off!
              console.log('[App] Ignored server interruption event because user is not speaking or mic is muted.');
            }
          }

          if (msg.type === 'turn_complete') {
            const isWaiting = conversationStateMachine.isWaitingForStudent();
            if (isWaiting) {
              conversationStateMachine.transitionTo('WAITING_FOR_STUDENT');
              setStatusMessage('শিক্ষক উত্তরের অপেক্ষায় আছেন (কথা বলুন বা নিচে চ্যাটে লিখুন)...');
            } else {
              setStatusMessage('পাঠদান চলছে (কথা বলুন, চ্যাটে লিখুন বা Next চাপুন)...');
            }
            armInactivityTimer(300000); // 5-minute inactivity safeguard
          }

          if (msg.type === 'error') {
            conversationStateMachine.releaseReconnectLock();
            setErrorMessage(msg.message);
            setStatusMessage('Error encountered.');
            addTranscript('system', `Error: ${msg.message}`);
          }
        } catch (err) {
          console.error('Error handling WebSocket message:', err);
        }
      };

      ws.onerror = (err) => {
        conversationStateMachine.releaseReconnectLock();
        console.error('WebSocket error:', err);
        setErrorMessage('Connection issue detected. Please check network connectivity and microphone access.');
      };

      ws.onclose = () => {
        conversationStateMachine.releaseReconnectLock();
        // If user didn't intentionally stop the call, auto-reconnect!
        if (callStatusRef.current !== 'idle') {
          setStatusMessage('Refreshing 5-minute session...');
          addTranscript('system', 'Reconnecting session seamlessly...');
          setTimeout(() => {
            if (callStatusRef.current !== 'idle') {
              startCall(true);
            }
          }, 1200);
        }
      };
    } catch (err: any) {
      conversationStateMachine.releaseReconnectLock();
      console.error('Start call error:', err);
      setErrorMessage(err.message || 'Failed to start call');
      stopCall();
    }
  };

  // Start microphone capture at 16kHz
  const startMicrophone = async () => {
    try {
      await audioRecorderRef.current?.start(
        (base64Pcm) => {
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && !isMicMuted) {
            wsRef.current.send(
              JSON.stringify({
                type: 'audio',
                data: base64Pcm,
              })
            );
          }
        },
        undefined, // onSilence
        (isSpeaking) => {
          if (isSpeaking) {
            clearInactivityTimer();
            setStatusMessage('Listening to your voice...');
          }
        },
        () => {
          clearInactivityTimer();
          // Exactly after 1.25s silence has elapsed: notify server turn is complete!
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(
              JSON.stringify({
                type: 'turn_complete',
              })
            );
          }
          setStatusMessage('Processing your answer...');
        }
      );
    } catch (micErr: any) {
      console.error('Microphone access error:', micErr);
      setErrorMessage('Microphone access denied or not available. You can still type messages into the live session.');
      addTranscript('system', 'Microphone not available. Keyboard input is ready.');
    }
  };

  // Stop Call Handler
  const stopCall = () => {
    conversationStateMachine.releaseReconnectLock();
    clearInactivityTimer();
    callStatusRef.current = 'idle';
    // Stop timers
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (meterIntervalRef.current) {
      clearInterval(meterIntervalRef.current);
      meterIntervalRef.current = null;
    }
    stopVideoStream();

    // Stop audio
    audioRecorderRef.current?.stop();
    audioPlayerRef.current?.stopAndClear();

    // Close WebSocket
    if (wsRef.current) {
      try {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'stop' }));
          wsRef.current.close();
        }
      } catch (e) {}
      wsRef.current = null;
    }

    lastResumptionHandleRef.current = null;
    setCallStatus('idle');
    setUserVolume(0);
    setAiVolume(0);
    setStatusMessage('Call ended. Ready to connect.');
  };

  // Toggle Mic
  const toggleMic = () => {
    if (isMicMuted) {
      audioRecorderRef.current?.resume();
      setIsMicMuted(false);
    } else {
      audioRecorderRef.current?.pause();
      setIsMicMuted(true);
    }
  };

  // Toggle Speaker / Output Audio
  const toggleSpeaker = () => {
    const next = !isSpeakerMuted;
    setIsSpeakerMuted(next);
    audioPlayerRef.current?.setMuted(next);
  };

  // Manual Interruption button
  const triggerInterrupt = () => {
    audioPlayerRef.current?.stopAndClear();
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'interrupt' }));
    }
    setCallStatus('interrupted');
    setTimeout(() => setCallStatus('active'), 1000);
  };

  // Camera vision stream
  const toggleVideo = async () => {
    if (isVideoEnabled) {
      stopVideoStream();
      setIsVideoEnabled(false);
      return;
    }

    try {
      stopVideoStream();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { max: 15 } },
      });
      videoStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setIsVideoEnabled(true);
      setIsScreenEnabled(false);

      startFrameStreaming();
    } catch (err: any) {
      console.error('Camera error:', err);
      setErrorMessage('Could not access camera: ' + err.message);
    }
  };

  // Screen share stream
  const toggleScreen = async () => {
    if (isScreenEnabled) {
      stopVideoStream();
      setIsScreenEnabled(false);
      return;
    }

    try {
      stopVideoStream();
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { max: 15 } },
      });
      videoStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setIsScreenEnabled(true);
      setIsVideoEnabled(false);

      stream.getVideoTracks()[0].onended = () => {
        stopVideoStream();
        setIsScreenEnabled(false);
      };

      startFrameStreaming();
    } catch (err: any) {
      console.error('Screen share error:', err);
    }
  };

  // Stop video/screen
  const stopVideoStream = () => {
    if (videoIntervalRef.current) {
      clearInterval(videoIntervalRef.current);
      videoIntervalRef.current = null;
    }
    if (videoStreamRef.current) {
      videoStreamRef.current.getTracks().forEach((t) => t.stop());
      videoStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsVideoEnabled(false);
    setIsScreenEnabled(false);
  };

  // Stream video frames at 1 FPS (as mandated by Live API guideline)
  const startFrameStreaming = () => {
    if (videoIntervalRef.current) clearInterval(videoIntervalRef.current);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    videoIntervalRef.current = window.setInterval(() => {
      if (!videoRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      const video = videoRef.current;
      if (video.videoWidth === 0 || video.videoHeight === 0) return;

      canvas.width = 480;
      canvas.height = (480 * video.videoHeight) / video.videoWidth;
      ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
      const base64Jpeg = dataUrl.split(',')[1];

      wsRef.current.send(
        JSON.stringify({
          type: 'video',
          data: base64Jpeg,
        })
      );
    }, 1000); // 1 frame per second
  };

  // Send quick action or typed text directly into live session (acts like speech)
  const sendQuickActionMessage = (text: string) => {
    if (!text.trim()) return;
    const cleanText = text.trim();
    clearInactivityTimer();
    addTranscript('user', cleanText);
    conversationStateMachine.processStudentInput(cleanText);

    // Stop current AI audio immediately so it responds right away to student's text
    audioPlayerRef.current?.stopAndClear();
    setCallStatus('interrupted');
    setTimeout(() => setCallStatus('active'), 400);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'text',
          text: cleanText,
        })
      );
      setStatusMessage('মেসেজ পাঠানো হয়েছে (AI উত্তর দিচ্ছে)...');
    } else {
      // If call not active, start call and deliver text once connected
      setStatusMessage('লাইভ কল শুরু করে মেসেজ পাঠানো হচ্ছে...');
      startCall().then(() => {
        setTimeout(() => {
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'text', text: cleanText }));
          }
        }, 1200);
      });
    }
  };

  // Send typed prompt directly into the Live session
  const handleSendTypedMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!typedMessage.trim()) return;
    const text = typedMessage.trim();
    setTypedMessage('');
    sendQuickActionMessage(text);
  };

  const WBBSE_CLASSES = ['Class 5', 'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10'];

  const COMPETITIVE_SUBJECTS = [
    { id: 'spoken-english', title: 'Spoken English', prompt: SHREYA_MAAM_PROMPT, voice: 'Kore', icon: '🗣️' },
    { id: 'indian-history', title: 'Indian History', prompt: BHATTACHARYA_SIR_PROMPT, voice: 'Charon', icon: '📜' },
    { id: 'polity-constitution', title: 'Polity & Constitution', prompt: SARMAD_MEHRAJ_SIR_PROMPT, voice: 'Charon', icon: '⚖️' },
    { id: 'indian-economy', title: 'Indian Economy', prompt: MRUNAL_PATEL_SIR_PROMPT, voice: 'Puck', icon: '📈' },
    { id: 'geography-astronomy', title: 'Geography & Astronomy', prompt: SUDARSHAN_GURJAR_SIR_PROMPT, voice: 'Fenrir', icon: '🌍' },
    { id: 'science-tech', title: 'Science & Technology', prompt: DR_SENGUPTA_PROMPT, voice: 'Fenrir', icon: '🔬' },
    { id: 'static-gk', title: 'Static GK', prompt: ADHIKARI_SIR_PROMPT, voice: 'Charon', icon: '🏛️' },
  ];

  const handleSelectClass = (cls: string) => {
    setSelectedClass(cls);
    setActiveSection('wbbse');
    const subjectName = selectedWbbseSubject === 'science' ? 'বিজ্ঞান' : selectedWbbseSubject === 'history' ? 'ইতিহাস' : 'ভূগোল';
    // Clear old session resume handle so previous subject never bleeds in
    lastResumptionHandleRef.current = null;
    conversationStateMachine.setResumptionHandle(null);
    const initialTopic = conversationStateMachine.pickRandomTopic(subjectName, cls);
    conversationStateMachine.setTeachingMode(teachingMode, cls, subjectName);
    conversationStateMachine.setTopic(initialTopic);
    setActiveContext(conversationStateMachine.getContext());
  };

  const handleSelectWbbseSubject = (subj: 'science' | 'history' | 'geography') => {
    setSelectedWbbseSubject(subj);
    setActiveSection('wbbse');
    const prompt = subj === 'science' ? WBBSE_SCIENCE_PROMPT : subj === 'history' ? WBBSE_HISTORY_PROMPT : WBBSE_GEOGRAPHY_PROMPT;
    const defaultVoice = subj === 'science' ? 'Kore' : 'Charon';
    const subjectName = subj === 'science' ? 'বিজ্ঞান' : subj === 'history' ? 'ইতিহাস' : 'ভূগোল';

    // Clear old session resume handle so previous subject never bleeds in
    lastResumptionHandleRef.current = null;
    conversationStateMachine.setResumptionHandle(null);
    setVoice(defaultVoice);
    setSystemInstruction(prompt);
    conversationStateMachine.updatePersona(prompt);
    const initialTopic = conversationStateMachine.pickRandomTopic(subjectName, selectedClass || 'Class 10');
    conversationStateMachine.setTeachingMode(teachingMode, selectedClass, subjectName);
    conversationStateMachine.setTopic(initialTopic);
    setActiveContext(conversationStateMachine.getContext());
  };

  const handleSelectCompetitiveSubject = (compSubj: typeof COMPETITIVE_SUBJECTS[0]) => {
    setSelectedCompetitiveSubject(compSubj.title);
    setActiveSection('competitive');

    // Clear old session resume handle so previous subject never bleeds in
    lastResumptionHandleRef.current = null;
    conversationStateMachine.setResumptionHandle(null);
    setVoice(compSubj.voice);
    setSystemInstruction(compSubj.prompt);
    conversationStateMachine.updatePersona(compSubj.prompt);
    // Explicitly pass undefined for classGrade so school class never attaches to competitive/spoken
    const initialTopic = conversationStateMachine.pickRandomTopic(compSubj.title);
    conversationStateMachine.setTeachingMode(teachingMode, undefined, compSubj.title);
    conversationStateMachine.setTopic(initialTopic);
    setActiveContext(conversationStateMachine.getContext());
  };

  const handleSelectMode = (mode: TeachingMode) => {
    setTeachingModeState(mode);

    let cls: string | undefined;
    let subjectName: string;
    let prompt: string;
    let defaultVoice: string;

    if (activeSection === 'wbbse') {
      cls = selectedClass || 'Class 10';
      subjectName = selectedWbbseSubject === 'science' ? 'বিজ্ঞান' : selectedWbbseSubject === 'history' ? 'ইতিহাস' : 'ভূগোল';
      prompt = selectedWbbseSubject === 'science' ? WBBSE_SCIENCE_PROMPT : selectedWbbseSubject === 'history' ? WBBSE_HISTORY_PROMPT : WBBSE_GEOGRAPHY_PROMPT;
      defaultVoice = selectedWbbseSubject === 'science' ? 'Kore' : 'Charon';
    } else {
      cls = undefined;
      subjectName = selectedCompetitiveSubject;
      const found = COMPETITIVE_SUBJECTS.find((s) => s.title === selectedCompetitiveSubject) || COMPETITIVE_SUBJECTS[0];
      prompt = found.prompt;
      defaultVoice = found.voice;
    }

    setVoice(defaultVoice);
    setSystemInstruction(prompt);
    conversationStateMachine.updatePersona(prompt);
    conversationStateMachine.setTeachingMode(mode, cls, subjectName);

    const modeLabel = mode === 'lecture' ? 'আলোচনা' : mode === 'doubts' ? 'AI কে প্রশ্ন' : 'প্রশ্ন উত্তর';

    // Point 2: If call is idle, do NOT auto-start call. User starts via Start button.
    // If call is already active, dynamically switch mode live:
    if (callStatus !== 'idle' && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const modeText = mode === 'lecture'
        ? `[মোড পরিবর্তন: আলোচনা]: এখন থেকে আমরা "আলোচনা" মোডে পড়াশোনা করব। কোনো অপ্রয়োজনীয় ভূমিকা ছাড়া ${cls ? `${cls} ` : ''}${subjectName}-এর বিষয়বস্তু একটানা অনর্গল বিস্তারিতভাবে বাংলায় বুঝিয়ে যান।`
        : mode === 'doubts'
        ? `[মোড পরিবর্তন: AI কে প্রশ্ন]: এখন থেকে আমরা "AI কে প্রশ্ন" মোডে পড়াশোনা করব। আমার যেকোনো প্রশ্ন বা ডাউট শুনুন এবং বাংলায় সহজ করে বুঝিয়ে উত্তর দিন।`
        : `[মোড পরিবর্তন: প্রশ্ন উত্তর]: এখন থেকে আমরা "প্রশ্ন উত্তর" মোডে পড়াশোনা করব। আপনি আমাকে ${cls ? `${cls} ` : ''}${subjectName}-এর উপর একটি একটি করে প্রশ্ন/MCQ জিজ্ঞাসা করুন এবং আমি উত্তর দেব।`;

      addTranscript('user', `[মোড পরিবর্তন: ${modeLabel}]`);
      wsRef.current.send(JSON.stringify({ type: 'text', text: modeText }));
      setStatusMessage(`সক্রিয় মোড: ${modeLabel}`);
    }
  };

  // Context-aware Next handler: maintains active translation drill or advances to next curriculum topic
  const handleNextClick = () => {
    const ctx = conversationStateMachine.getContext();
    const isSpoken = ctx.personaId === 'shreya-maam' || ctx.subject === 'Spoken English';
    const isTranslation =
      ctx.currentTopic?.toLowerCase().includes('translation') ||
      ctx.teachingModeLabel === 'অনুবাদ অনুশীলন' ||
      ctx.lastStudentInput?.toLowerCase().includes('translation') ||
      ctx.lastStudentInput?.toLowerCase().includes('অনুবাদ') ||
      (ctx.lastStudentInput?.toLowerCase().includes('bangla') && ctx.lastStudentInput?.toLowerCase().includes('english'));

    if (isTranslation) {
      sendQuickActionMessage('দারুণ! পরের বাংলা বাক্যটি বলুন, আমি ইংরেজিতে অনুবাদ করব।');
      return;
    }

    if (isSpoken) {
      if (teachingMode === 'quiz') {
        sendQuickActionMessage('পরের স্পোকেন ইংলিশ প্রশ্ন বা ইংরেজি অনুশীলনের বাক্যটি দিন।');
      } else {
        const nextTopic = conversationStateMachine.pickRandomTopic('Spoken English');
        sendQuickActionMessage(`চমৎকার! এবার পরের টপিক "${nextTopic}" নিয়ে আলোচনা বা স্পিকিং প্র্যাকটিস শুরু করুন।`);
      }
      return;
    }

    if (teachingMode === 'quiz') {
      sendQuickActionMessage('পরের প্রশ্নটি জিজ্ঞাসা করো');
    } else {
      const cls = selectedClass || 'Class 10';
      const subj = selectedWbbseSubject === 'science' ? 'বিজ্ঞান' : selectedWbbseSubject === 'history' ? 'ইতিহাস' : 'ভূগোল';
      const nextTopic = activeSection === 'wbbse'
        ? conversationStateMachine.pickRandomTopic(subj, cls)
        : conversationStateMachine.pickRandomTopic(selectedCompetitiveSubject);
      sendQuickActionMessage(`এবার পরের বিষয় "${nextTopic}" নিয়ে বিশদে একটানা আলোচনা শুরু করো।`);
    }
  };

  const handleSelectPersona = (prompt: string, defaultVoice: string) => {
    setVoice(defaultVoice);
    setSystemInstruction(prompt);
    conversationStateMachine.updatePersona(prompt);
    startCall();
  };

  const selectedVoiceMeta = VOICES.find((v) => v.id === voice) || VOICES[0];

  return (
    <div className="flex min-h-screen w-full max-w-full flex-col bg-slate-950 text-slate-100 font-sans">
      {/* Top Navigation Bar */}
      <header className="flex h-14 sm:h-16 shrink-0 items-center justify-between border-b border-slate-800/80 px-3 sm:px-6 bg-slate-950/70 backdrop-blur-md z-30">
        <div className="flex items-center gap-2.5 min-w-0">
          <img
            src="https://i.ibb.co/7qJGpT1/icon-192.png"
            alt="Mega Quiz Voice AI"
            className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl object-cover shadow-lg shadow-cyan-500/20 shrink-0"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <h1 className="text-sm sm:text-base font-bold text-white tracking-tight truncate">
                Mega Quiz Voice AI -By Arif Hussain
              </h1>
            </div>
            <p className="text-[10px] sm:text-[11px] text-slate-400 truncate hidden xs:block">Real-time Conversational Voice & Vision</p>
          </div>
        </div>

        {/* Center Status: Backend Connected + In-Call Status */}
        <div className="hidden md:flex items-center gap-2.5">
          {/* Simple Backend Connected Indicator (No links or domains) */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-950/40 text-xs text-emerald-300 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-semibold">Backend Connected</span>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-800 bg-slate-900/60 text-xs">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                callStatus === 'active' || callStatus === 'speaking' || callStatus === 'listening'
                  ? 'bg-emerald-400 animate-ping'
                  : callStatus === 'connecting'
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-slate-500'
              }`}
            />
            <span className="font-medium text-slate-300">
              {callStatus === 'idle' && 'Disconnected'}
              {callStatus === 'connecting' && 'Connecting...'}
              {callStatus === 'active' && 'Live In-Call'}
              {callStatus === 'speaking' && 'AI Speaking'}
              {callStatus === 'listening' && 'Listening to You'}
              {callStatus === 'interrupted' && 'Interrupted'}
            </span>
            {callStatus !== 'idle' && (
              <span className="ml-2 font-mono text-[11px] text-cyan-400 border-l border-slate-700 pl-2">
                {formatTime(callDuration)}
              </span>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Mobile Backend Status indicator */}
          <div className="flex md:hidden items-center gap-1 px-2 py-1 rounded-full border border-emerald-500/30 bg-emerald-950/40 text-[10px] text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-medium">Backend Connected</span>
          </div>

          {/* Mobile Transcript Toggle Button */}
          <button
            onClick={() => setShowMobileTranscript(true)}
            className="flex md:hidden items-center gap-1 px-2 py-1.5 rounded-lg border border-slate-800 bg-slate-900/60 text-slate-300 text-xs font-semibold"
            title="View Live Transcript"
          >
            <MessageSquare className="h-3.5 w-3.5 text-cyan-400" />
            <span className="text-[10px]">Chat</span>
          </button>

          {/* Settings Button */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`p-1.5 sm:p-2 rounded-lg border text-slate-300 hover:text-white transition-all ${
              showSettings ? 'border-indigo-500 bg-indigo-950/40 text-white' : 'border-slate-800 bg-slate-900/60'
            }`}
            title="Voice & Model Settings"
          >
            <Settings2 className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Error Banner */}
      {errorMessage && (
        <div className="flex items-center justify-between bg-red-950/90 border-b border-red-800 px-4 py-2.5 text-xs text-red-200">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
            <span className="truncate">{errorMessage}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            <button
              onClick={() => setErrorMessage(null)}
              className="text-red-300 hover:text-white text-xs underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex flex-1 relative w-full max-w-full min-h-0 md:h-[calc(100vh-3.5rem)] md:overflow-hidden">
        {/* Left Side: Call Stage / Visualizer */}
        <div className="flex-1 flex flex-col p-3 sm:p-5 overflow-y-auto overflow-x-hidden w-full max-w-full min-h-0 [scrollbar-width:thin] [scrollbar-color:#334155_transparent]">
          {/* Quick Info Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 w-full max-w-full mb-2">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2.5 max-w-full">
              <span className="flex items-center gap-1.5 bg-slate-900/80 px-2 py-1 rounded-md border border-slate-800 text-[11px] sm:text-xs">
                <Cpu className="h-3.5 w-3.5 text-indigo-400" />
                <span className="font-mono text-slate-200">
                  {model === 'gemini-3.8-live' ? 'Model 1' : 'Model 2'}
                </span>
              </span>
              <span className="flex items-center gap-1.5 bg-slate-900/80 px-2.5 py-1 rounded-md border border-slate-800 text-[11px] sm:text-xs">
                <Volume2 className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                <span>Voice:</span>
                <strong className="text-white font-mono">{voice}</strong>
              </span>
              {activeContext.currentTopic ? (
                <span className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-950/90 to-slate-900/90 border border-emerald-500/50 text-emerald-200 px-2.5 py-1 rounded-md text-[11px] sm:text-xs shadow-sm max-w-[170px] sm:max-w-[320px]">
                  <BookOpen className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  <span className="font-bold truncate text-emerald-100" title={activeContext.currentTopic}>
                    {activeContext.currentTopic}
                  </span>
                </span>
              ) : (
                <span className="flex items-center gap-1.5 bg-slate-900/60 border border-slate-800 text-slate-400 px-2.5 py-1 rounded-md text-[11px] sm:text-xs">
                  <BookOpen className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                  <span className="truncate">টপিক নির্বাচন করুন</span>
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  const speeds = [0.85, 1.0, 1.15, 1.25];
                  const currentIdx = speeds.indexOf(speechSpeed);
                  const nextSpeed = currentIdx === -1 || currentIdx === speeds.length - 1 ? speeds[0] : speeds[currentIdx + 1];
                  setSpeechSpeed(nextSpeed);
                }}
                className="flex items-center gap-1.5 bg-slate-900/80 hover:bg-slate-800 px-2 py-1 rounded-md border border-slate-800 text-slate-300 hover:text-white transition-colors text-[11px] sm:text-xs"
                title="Click to cycle Speech Speed (0.85x, 1.0x, 1.15x, 1.25x)"
              >
                <Gauge className="h-3.5 w-3.5 text-amber-400" />
                <span>Speed:</span>
                <strong className="text-amber-300 font-mono">{speechSpeed}x</strong>
              </button>
            </div>

            {callStatus !== 'idle' && (
              <div className="flex items-center gap-2 text-[10px] sm:text-[11px] font-mono text-slate-500">
                <span className="text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30 flex items-center gap-1">
                  <RefreshCw className="h-3 w-3 animate-spin" style={{ animationDuration: '8s' }} />
                  <span>Auto-Renew: {Math.max(0, 240 - (callDuration % 240))}s</span>
                </span>
                <span className="hidden sm:inline">16k/24k</span>
                <span>Chunks: {chunksReceived}</span>
              </div>
            )}
          </div>

          {/* Central Interactive Orb & Stage */}
          <div className="flex-1 flex flex-col items-center justify-start py-2 sm:py-4 relative w-full max-w-full">
            {/* Hidden Video Canvas for Frame Streaming */}
            <video
              ref={videoRef}
              playsInline
              muted
              className={`rounded-2xl border-2 border-cyan-500/40 shadow-2xl bg-black mb-4 transition-all duration-300 ${
                isVideoEnabled || isScreenEnabled ? 'w-64 h-48 object-cover max-w-full' : 'hidden'
              }`}
            />

            {(isVideoEnabled || isScreenEnabled) && (
              <div className="mb-4 flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-[11px] text-cyan-300">
                <Eye className="h-3.5 w-3.5 animate-pulse text-cyan-400" />
                <span>Streaming visual frames at 1 FPS to Gemini Live</span>
              </div>
            )}

            {/* Audio Reactive Orb with responsive size */}
            <AudioOrb
              status={callStatus}
              userVolume={userVolume}
              aiVolume={aiVolume}
              size={typeof window !== 'undefined' && window.innerWidth < 450 ? (callStatus === 'idle' ? 180 : 120) : (callStatus === 'idle' ? 240 : 170)}
            />

            {/* Live In-Call Mode Indicator & Switcher */}
            {callStatus !== 'idle' && (
              <div className="mt-2.5 flex items-center gap-1.5 sm:gap-2 p-1 sm:p-1.5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl backdrop-blur-md">
                <span className="text-[10px] text-slate-400 font-semibold px-2 hidden sm:inline">পড়ার মোড:</span>
                <button
                  type="button"
                  onClick={() => handleSelectMode('lecture')}
                  className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 sm:gap-1.5 transition-all ${
                    teachingMode === 'lecture'
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/40 ring-1 ring-emerald-400'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                  }`}
                  title="AI একটানা অধ্যায়ের বিষয়বস্তু বিস্তারিত বোঝাবে (Non-stop Lecture)"
                >
                  <span>🎙️</span>
                  <span>আলোচনা</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectMode('doubts')}
                  className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 sm:gap-1.5 transition-all ${
                    teachingMode === 'doubts'
                      ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/40 ring-1 ring-cyan-400'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                  }`}
                  title="তোমার প্রশ্নের উত্তর দেবে AI (Doubt Clearing)"
                >
                  <span>🙋‍♂️</span>
                  <span>AI কে প্রশ্ন</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectMode('quiz')}
                  className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 sm:gap-1.5 transition-all ${
                    teachingMode === 'quiz'
                      ? 'bg-purple-600 text-white shadow-md shadow-purple-600/40 ring-1 ring-purple-400'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                  }`}
                  title="AI তোমাকে প্রশ্ন করবে, তুমি উত্তর দেবে (Oral Test & Quiz)"
                >
                  <span>📝</span>
                  <span>প্রশ্ন উত্তর</span>
                </button>
              </div>
            )}

            {/* Status Text & Subtitle */}
            <div className="mt-2.5 text-center">
              <p className="text-sm font-semibold text-slate-200 tracking-wide">{statusMessage}</p>
              {callStatus === 'idle' && (
                <p className="text-xs text-slate-500 mt-1 max-w-md">
                  শ্রেণি ও বিষয় নির্বাচন করে সরাসরি লাইভ ক্লাস শুরু করো।
                </p>
              )}
            </div>

            {/* Mobile Inline YouTube Live Chat View (Only on mobile when in call) */}
            {callStatus !== 'idle' && (
              <div className="md:hidden w-full max-w-xl h-44 sm:h-52 my-2.5 shrink-0">
                <TranscriptView
                  items={transcripts}
                  onClear={() => setTranscripts([])}
                  voiceName={voice}
                  compact={true}
                />
              </div>
            )}

            {/* Quick Starter Conversation Prompts - Strictly Separated Sections */}
            {callStatus === 'idle' && (
              <div className="mt-5 w-full max-w-3xl space-y-3">
                {/* 1. WBBSE (Class V - X) Section with Class Selector & 3 Modes */}
                <div className="rounded-2xl border border-emerald-500/40 bg-gradient-to-r from-emerald-950/40 via-slate-900/60 to-emerald-950/40 p-3 sm:p-4 shadow-lg shadow-emerald-950/20">
                  <div className="flex items-center justify-between mb-2.5 px-1">
                    <span className="text-xs sm:text-sm font-bold text-emerald-400 flex items-center gap-1.5">
                      <BookOpen className="h-4 w-4" />
                      WBBSE পশ্চিমবঙ্গ মধ্যশিক্ষা পর্ষদ (Class V - X)
                    </span>
                    <span className="text-[10px] text-emerald-300 bg-emerald-950/90 border border-emerald-500/40 px-2 py-0.5 rounded-full font-medium shadow-sm">
                      বাংলা পাঠ্যবই
                    </span>
                  </div>

                  {/* Step 1: Select Class - Pure Class Names (Class 5 - Class 10) */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1.5 px-1">
                      <span className="text-[11px] font-semibold text-slate-300">
                        শ্রেণি নির্বাচন করুন:
                      </span>
                      {selectedClass && (
                        <span className="text-[10px] text-emerald-400 font-mono font-medium">
                          {selectedClass}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                      {WBBSE_CLASSES.map((cls) => {
                        const isSelected = selectedClass === cls;
                        return (
                          <button
                            key={cls}
                            type="button"
                            onClick={() => handleSelectClass(cls)}
                            className={`py-1.5 px-2 rounded-xl text-xs font-semibold text-center transition-all border ${
                              isSelected
                                ? 'bg-emerald-600 text-white border-emerald-400 shadow-md shadow-emerald-600/30 scale-105'
                                : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 border-slate-700/80 hover:border-emerald-500/40'
                            }`}
                          >
                            {cls}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Step 2: Select Subject */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1.5 px-1">
                      <span className="text-[11px] font-semibold text-slate-300">
                        বিষয় নির্বাচন করুন:
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => handleSelectWbbseSubject('science')}
                        className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all flex items-center justify-center gap-1.5 text-center ${
                          selectedWbbseSubject === 'science'
                            ? 'border-emerald-400 bg-emerald-900/80 text-white shadow-md shadow-emerald-500/20'
                            : 'border-emerald-500/30 bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-200'
                        }`}
                      >
                        <span>🔬</span>
                        <span>বিজ্ঞান (ভৌত+জীবন)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectWbbseSubject('history')}
                        className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all flex items-center justify-center gap-1.5 text-center ${
                          selectedWbbseSubject === 'history'
                            ? 'border-emerald-400 bg-emerald-900/80 text-white shadow-md shadow-emerald-500/20'
                            : 'border-emerald-500/30 bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-200'
                        }`}
                      >
                        <span>📖</span>
                        <span>ইতিহাস</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectWbbseSubject('geography')}
                        className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all flex items-center justify-center gap-1.5 text-center ${
                          selectedWbbseSubject === 'geography'
                            ? 'border-emerald-400 bg-emerald-900/80 text-white shadow-md shadow-emerald-500/20'
                            : 'border-emerald-500/30 bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-200'
                        }`}
                      >
                        <span>🗺️</span>
                        <span>ভূগোল</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* 2. Competitive & Spoken Section */}
                <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3 sm:p-4">
                  <div className="flex items-center justify-between mb-2.5 px-1">
                    <span className="text-xs sm:text-sm font-bold text-amber-400 flex items-center gap-1.5">
                      <GraduationCap className="h-4 w-4" />
                      Competitive & Spoken
                    </span>
                    <span className="text-[10px] text-amber-400/80 bg-amber-950/60 border border-amber-500/30 px-2 py-0.5 rounded-full font-medium">
                      বিষয়সমূহ
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-1.5">
                    {COMPETITIVE_SUBJECTS.map((comp) => {
                      const isSelected = activeSection === 'competitive' && selectedCompetitiveSubject === comp.title;
                      return (
                        <button
                          key={comp.id}
                          type="button"
                          onClick={() => handleSelectCompetitiveSubject(comp)}
                          className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                            isSelected
                              ? 'border-amber-400 bg-amber-900/70 text-white shadow-md shadow-amber-500/20'
                              : 'border-slate-700 bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-white'
                          }`}
                        >
                          <span>{comp.icon} {comp.title}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Unified Mode Section (One single selector for all subjects) */}
                <div className="rounded-2xl border border-indigo-500/40 bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 p-3 sm:p-4 shadow-lg shadow-indigo-950/20">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <span className="text-xs sm:text-sm font-bold text-slate-100 flex items-center gap-1.5">
                      পড়ার মোড ({activeSection === 'wbbse' ? `${selectedClass} - ${selectedWbbseSubject === 'science' ? 'বিজ্ঞান' : selectedWbbseSubject === 'history' ? 'ইতিহাস' : 'ভূগোল'}` : selectedCompetitiveSubject}):
                    </span>
                    <span className="text-[10px] text-cyan-300 bg-cyan-950/60 border border-cyan-500/30 px-2 py-0.5 rounded-full font-medium">
                      {activeSection === 'wbbse' ? 'WBBSE' : 'Competitive & Spoken'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 sm:gap-3">
                    {/* Option 1: আলোচনা */}
                    <button
                      type="button"
                      onClick={() => handleSelectMode('lecture')}
                      className={`py-2 px-2.5 sm:px-3 rounded-xl border text-center transition-all font-semibold text-xs flex items-center justify-center gap-1.5 shadow-sm ${
                        teachingMode === 'lecture'
                          ? 'bg-emerald-600 text-white border-emerald-400 shadow-emerald-600/30 ring-1 ring-emerald-400'
                          : 'bg-slate-900/90 hover:bg-slate-800 text-slate-300 border-slate-700/80 hover:border-emerald-500/40'
                      }`}
                    >
                      <span>🎙️</span>
                      <span>আলোচনা</span>
                    </button>

                    {/* Option 2: AI কে প্রশ্ন */}
                    <button
                      type="button"
                      onClick={() => handleSelectMode('doubts')}
                      className={`py-2 px-2.5 sm:px-3 rounded-xl border text-center transition-all font-semibold text-xs flex items-center justify-center gap-1.5 shadow-sm ${
                        teachingMode === 'doubts'
                          ? 'bg-cyan-600 text-white border-cyan-400 shadow-cyan-600/30 ring-1 ring-cyan-400'
                          : 'bg-slate-900/90 hover:bg-slate-800 text-slate-300 border-slate-700/80 hover:border-cyan-500/40'
                      }`}
                    >
                      <span>🙋‍♂️</span>
                      <span>AI কে প্রশ্ন</span>
                    </button>

                    {/* Option 3: প্রশ্ন উত্তর */}
                    <button
                      type="button"
                      onClick={() => handleSelectMode('quiz')}
                      className={`py-2 px-2.5 sm:px-3 rounded-xl border text-center transition-all font-semibold text-xs flex items-center justify-center gap-1.5 shadow-sm ${
                        teachingMode === 'quiz'
                          ? 'bg-purple-600 text-white border-purple-400 shadow-purple-600/30 ring-1 ring-purple-400'
                          : 'bg-slate-900/90 hover:bg-slate-800 text-slate-300 border-slate-700/80 hover:border-purple-500/40'
                      }`}
                    >
                      <span>📝</span>
                      <span>প্রশ্ন উত্তর</span>
                    </button>
                  </div>

                  {/* Immediate Start Class Call button inside the Unified Mode Section */}
                  <div className="mt-3.5 pt-3 border-t border-indigo-500/20 flex flex-col sm:flex-row items-center justify-between gap-2.5">
                    <div className="text-[11px] text-slate-300 flex items-center gap-1.5 max-w-full truncate">
                      <span className="text-slate-400 shrink-0">নির্বাচিত:</span>
                      <strong className="text-emerald-300 font-semibold truncate">
                        {activeSection === 'wbbse'
                          ? `${selectedClass} · ${selectedWbbseSubject === 'science' ? 'বিজ্ঞান' : selectedWbbseSubject === 'history' ? 'ইতিহাস' : 'ভূগোল'}`
                          : selectedCompetitiveSubject}
                      </strong>
                      <span className="text-slate-500 shrink-0">·</span>
                      <span className="text-cyan-300 font-semibold shrink-0">
                        {teachingMode === 'lecture' ? '🎙️ আলোচনা' : teachingMode === 'doubts' ? '🙋‍♂️ AI কে প্রশ্ন' : '📝 প্রশ্ন উত্তর'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => startCall(false)}
                      className="w-full sm:w-auto px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm bg-gradient-to-r from-cyan-500 via-indigo-600 to-purple-600 hover:brightness-110 active:scale-95 text-white shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-2 transition-all shrink-0"
                    >
                      <PhoneCall className="h-4 w-4" />
                      <span>লাইভ ক্লাস শুরু করো (Start Live Call)</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Live Call Controls Toolbar */}
          <div className="mt-4 flex flex-col items-center gap-2.5 sm:gap-4 w-full max-w-full pb-8">
              <div className="flex flex-wrap items-center justify-center gap-1 sm:gap-2 p-1.5 sm:p-2 rounded-2xl border border-slate-800/90 bg-slate-900/80 backdrop-blur-md shadow-2xl w-full max-w-xl mx-auto">
                {/* Mic Toggle */}
                <button
                  onClick={toggleMic}
                  disabled={callStatus === 'idle'}
                  className={`p-2 sm:p-3 rounded-xl border transition-all ${
                    isMicMuted
                      ? 'border-red-500/50 bg-red-950/50 text-red-400 shadow-sm shadow-red-500/20'
                      : 'border-slate-700 bg-slate-800/80 text-white hover:bg-slate-700'
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                  title={isMicMuted ? 'Unmute Microphone' : 'Mute Microphone (Noisy Area)'}
                >
                  {isMicMuted ? <MicOff className="h-4 w-4 sm:h-5 sm:w-5" /> : <Mic className="h-4 w-4 sm:h-5 sm:w-5" />}
                </button>

                {/* Camera Vision Toggle */}
                <button
                  onClick={toggleVideo}
                  disabled={callStatus === 'idle'}
                  className={`p-2 sm:p-3 rounded-xl border transition-all ${
                    isVideoEnabled
                      ? 'border-cyan-500 bg-cyan-950/40 text-cyan-400 shadow-md shadow-cyan-500/20'
                      : 'border-slate-700 bg-slate-800/80 text-slate-300 hover:bg-slate-700'
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                  title="Toggle Webcam Vision (1 FPS)"
                >
                  {isVideoEnabled ? <Video className="h-4 w-4 sm:h-5 sm:w-5" /> : <VideoOff className="h-4 w-4 sm:h-5 sm:w-5" />}
                </button>

                {/* Screen Share Vision Toggle */}
                <button
                  onClick={toggleScreen}
                  disabled={callStatus === 'idle'}
                  className={`p-2 sm:p-3 rounded-xl border transition-all ${
                    isScreenEnabled
                      ? 'border-indigo-500 bg-indigo-950/40 text-indigo-400 shadow-md shadow-indigo-500/20'
                      : 'border-slate-700 bg-slate-800/80 text-slate-300 hover:bg-slate-700'
                  } disabled:opacity-40 disabled:cursor-not-allowed hidden sm:flex`}
                  title="Toggle Screen Sharing Vision (1 FPS)"
                >
                  <Monitor className="h-4 w-4 sm:h-5 sm:w-5" />
                </button>

                {/* Main Call Start / End Button */}
                {callStatus === 'idle' ? (
                  <button
                    onClick={() => startCall(false)}
                    className="flex items-center gap-1.5 sm:gap-2 px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl font-bold text-xs sm:text-sm bg-gradient-to-r from-cyan-500 via-indigo-600 to-purple-600 text-white shadow-xl shadow-cyan-500/25 hover:brightness-110 active:scale-95 transition-all shrink-0"
                  >
                    <PhoneCall className="h-4 w-4 sm:h-5 sm:w-5" />
                    <span>Start Live Call</span>
                  </button>
                ) : (
                  <button
                    onClick={stopCall}
                    className="flex items-center gap-1.5 sm:gap-2 px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl font-bold text-xs sm:text-sm bg-red-600 hover:bg-red-500 text-white shadow-xl shadow-red-600/25 active:scale-95 transition-all shrink-0"
                  >
                    <PhoneOff className="h-4 w-4 sm:h-5 sm:w-5" />
                    <span>End Call</span>
                  </button>
                )}

                {/* Interrupt Button */}
                <button
                  onClick={triggerInterrupt}
                  disabled={callStatus === 'idle'}
                  className="flex items-center gap-1 px-2.5 sm:px-3.5 py-2 sm:py-3 rounded-xl border border-amber-500/40 bg-amber-950/30 hover:bg-amber-900/40 text-amber-300 text-xs font-semibold disabled:opacity-40 transition-all shrink-0"
                  title="Instantly stop AI speech"
                >
                  <Zap className="h-4 w-4" />
                  <span className="hidden sm:inline">Interrupt</span>
                </button>

                {/* Seamless Session Renew Button */}
                <button
                  onClick={renewSession}
                  disabled={callStatus === 'idle'}
                  className="flex items-center gap-1 px-2.5 sm:px-3 py-2 sm:py-3 rounded-xl border border-indigo-500/40 bg-indigo-950/30 hover:bg-indigo-900/40 text-indigo-300 text-xs font-semibold disabled:opacity-40 transition-all shrink-0"
                  title="Renew 5-minute session without hanging up"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span className="hidden sm:inline">Renew</span>
                </button>

                {/* Speaker Toggle */}
                <button
                  onClick={toggleSpeaker}
                  className={`p-2 sm:p-3 rounded-xl border transition-all ${
                    isSpeakerMuted
                      ? 'border-amber-500/50 bg-amber-950/40 text-amber-400'
                      : 'border-slate-700 bg-slate-800/80 text-slate-300 hover:bg-slate-700'
                  }`}
                  title={isSpeakerMuted ? 'Unmute Audio Playback' : 'Mute Audio Playback'}
                >
                  {isSpeakerMuted ? <VolumeX className="h-4 w-4 sm:h-5 sm:w-5" /> : <Volume2 className="h-4 w-4 sm:h-5 sm:w-5" />}
                </button>
              </div>

              {/* Noisy Environment Mic Muted Guidance Banner */}
              {isMicMuted && (
                <div className="w-full max-w-xl flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl border border-amber-500/40 bg-amber-950/70 text-amber-200 text-xs shadow-md animate-in fade-in">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <MicOff className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                    <span className="truncate">মাইক বন্ধ: কোলাহল হলেও নিচে লিখে বা Next বাটন চেপে সহজে ক্লাস করুন।</span>
                  </div>
                  <button
                    type="button"
                    onClick={toggleMic}
                    className="text-[11px] font-bold text-amber-400 hover:text-amber-200 underline shrink-0"
                  >
                    মাইক অন
                  </button>
                </div>
              )}

              {/* Quick Action Touch Buttons directly above Chat Input */}
              <div className="w-full max-w-xl grid grid-cols-3 gap-1.5 sm:gap-2 px-0.5">
                <button
                  type="button"
                  onClick={handleNextClick}
                  className="w-full py-2 px-1 sm:px-2 rounded-xl border border-cyan-500/40 bg-cyan-950/50 hover:bg-cyan-900/60 active:scale-95 text-cyan-200 text-[11px] sm:text-xs font-semibold flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 shadow-sm transition-all min-w-0"
                  title="পরের বিষয় বা প্রশ্ন"
                >
                  <span className="text-sm sm:text-xs shrink-0">⏭️</span>
                  <span className="truncate text-center">Next (পরের বিষয়)</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    sendQuickActionMessage('আগের বিষয়টি আরেকবার সহজ করে সুন্দরভাবে বুঝিয়ে দাও')
                  }
                  className="w-full py-2 px-1 sm:px-2 rounded-xl border border-amber-500/40 bg-amber-950/50 hover:bg-amber-900/60 active:scale-95 text-amber-200 text-[11px] sm:text-xs font-semibold flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 shadow-sm transition-all min-w-0"
                  title="আবার সুন্দর করে বোঝাও"
                >
                  <span className="text-sm sm:text-xs shrink-0">🔁</span>
                  <span className="truncate text-center">Repeat (আবার বলো)</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    sendQuickActionMessage(
                      teachingMode === 'quiz'
                        ? 'সঠিক উত্তরটি বুঝিয়ে বলো এবং পরের প্রশ্ন দাও'
                        : 'এই বিষয়টি আরেকটু গভীরে গিয়ে উদাহরণসহ বুঝিয়ে দাও'
                    )
                  }
                  className="w-full py-2 px-1 sm:px-2 rounded-xl border border-purple-500/40 bg-purple-950/50 hover:bg-purple-900/60 active:scale-95 text-purple-200 text-[11px] sm:text-xs font-semibold flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 shadow-sm transition-all min-w-0"
                  title="আরও বিস্তারিত তথ্য"
                >
                  <span className="text-sm sm:text-xs shrink-0">❓</span>
                  <span className="truncate text-center">Detail (আরও বলো)</span>
                </button>
              </div>

              {/* In-Call Text Input Bar */}
              <form
                onSubmit={handleSendTypedMessage}
                className="w-full max-w-xl flex items-center gap-1.5 sm:gap-2 bg-slate-900/80 border border-slate-700/80 rounded-xl p-1.5 pl-2.5 sm:pl-3 focus-within:border-cyan-400 shadow-lg"
              >
                <input
                  type="text"
                  value={typedMessage}
                  onChange={(e) => setTypedMessage(e.target.value)}
                  placeholder="কথা বলতে না পারলে এখানে লিখুন (Enter চাপুন)..."
                  className="flex-1 bg-transparent text-xs sm:text-sm text-white placeholder-slate-400 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!typedMessage.trim()}
                  className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-xs font-semibold transition-all flex items-center gap-1 shrink-0"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span className="hidden xs:inline">Send</span>
                </button>
              </form>
            </div>
          </div>

        {/* Right Side: Live Transcript View */}
        <div className="w-80 lg:w-96 border-l border-slate-800/80 bg-slate-950/40 flex flex-col p-3 lg:p-4 shrink-0 hidden md:flex min-h-0 h-full overflow-hidden">
          <TranscriptView
            items={transcripts}
            onClear={() => setTranscripts([])}
            voiceName={voice}
          />
        </div>
      </div>

      {/* Settings Drawer / Slide-Over */}
      {showSettings && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-slate-900 border-l border-slate-800 h-full flex flex-col p-6 overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Settings2 className="h-5 w-5 text-cyan-400" />
                <h3 className="font-bold text-white text-base">Live Call Configuration</h3>
              </div>
              <button
                onClick={() => setShowSettings(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="py-6 space-y-6">
              {/* Model Choice */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-2">
                  Live Voice AI Model
                </label>
                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    onClick={() => setModel('gemini-3.8-live')}
                    disabled={callStatus !== 'idle'}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      model === 'gemini-3.8-live'
                        ? 'border-cyan-500 bg-cyan-950/30 ring-1 ring-cyan-500/50'
                        : 'border-slate-800 bg-slate-900/50 hover:bg-slate-800'
                    } ${callStatus !== 'idle' ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    <div className="text-xs font-bold text-white flex items-center justify-between">
                      <span>Model 1</span>
                      <span className="text-[10px] text-cyan-400 bg-cyan-950 px-2 py-0.5 rounded border border-cyan-500/30">
                        Fastest
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 mt-1 font-medium">
                      1. Model 1: Fastest best for conversation
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setModel('gemini-3.8-live-extended-thinking')}
                    disabled={callStatus !== 'idle'}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      model === 'gemini-3.8-live-extended-thinking'
                        ? 'border-purple-500 bg-purple-950/30 ring-1 ring-purple-500/50'
                        : 'border-slate-800 bg-slate-900/50 hover:bg-slate-800'
                    } ${callStatus !== 'idle' ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    <div className="text-xs font-bold text-white flex items-center justify-between">
                      <span>Model 2</span>
                      <span className="text-[10px] text-purple-400 bg-purple-950 px-2 py-0.5 rounded border border-purple-500/30">
                        Complex & Technical
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 mt-1 font-medium">
                      2. Model 2 : Slow but best for Complex and Technical topics
                    </p>
                  </button>
                </div>
              </div>

              {/* Voice Selection & System Prompt */}
              <VoiceSelector
                selectedVoice={voice}
                onSelectVoice={setVoice}
                systemInstruction={systemInstruction}
                onChangeInstruction={setSystemInstruction}
                disabled={callStatus !== 'idle'}
              />

              {/* Speech Speed Controller */}
              <div className="bg-slate-950/40 p-3.5 rounded-xl border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <Gauge className="h-3.5 w-3.5 text-amber-400" />
                    Speech Speed Controller
                  </label>
                  <span className="text-xs font-mono font-bold text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-500/30">
                    {speechSpeed.toFixed(2)}x
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                  {[0.75, 0.9, 1.0, 1.15, 1.25].map((spd) => (
                    <button
                      key={spd}
                      type="button"
                      onClick={() => setSpeechSpeed(spd)}
                      className={`py-1.5 rounded-lg border text-xs font-medium transition-all ${
                        speechSpeed === spd
                          ? 'border-amber-500 bg-amber-950/50 text-amber-300 shadow-sm shadow-amber-500/20'
                          : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      {spd === 1.0 ? '1.0x' : `${spd}x`}
                    </button>
                  ))}
                </div>
                <input
                  type="range"
                  min="0.7"
                  max="1.35"
                  step="0.05"
                  value={speechSpeed}
                  onChange={(e) => setSpeechSpeed(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
                />
                <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                  <span>0.70x (Slower)</span>
                  <span>1.0x (Standard)</span>
                  <span>1.35x (Faster)</span>
                </div>
              </div>

              {/* Microphone Sensitivity & Noise Rejection */}
              <div className="bg-slate-950/40 p-3.5 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <Sliders className="h-3.5 w-3.5 text-cyan-400" />
                    Microphone Sensitivity (নয়েজ ফিল্টারিং)
                  </label>
                  <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-500/30">
                    {micSensitivity === 0
                      ? '0% (Full Noise Shield)'
                      : micSensitivity <= 30
                      ? `Heavy Noise Cut (${micSensitivity}%)`
                      : micSensitivity <= 60
                      ? `Balanced (${micSensitivity}%)`
                      : `Quiet Room (${micSensitivity}%)`}
                  </span>
                </div>

                {/* Quick Presets */}
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { label: '0% Full Noise', val: 0, sub: 'ফ্যান/কোলাহল' },
                    { label: '30% Moderate', val: 30, sub: 'সাধারণ ফ্যান' },
                    { label: '60% Balanced', val: 60, sub: 'স্বাভাবিক' },
                    { label: '100% No Noise', val: 100, sub: 'শান্ত ঘর' },
                  ].map((preset) => (
                    <button
                      key={preset.val}
                      type="button"
                      onClick={() => setMicSensitivity(preset.val)}
                      className={`py-1 px-1 text-center rounded-lg border transition-all ${
                        micSensitivity === preset.val
                          ? 'border-cyan-500 bg-cyan-950/50 text-cyan-300 shadow-sm shadow-cyan-500/20'
                          : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      <div className="text-[11px] font-semibold">{preset.label}</div>
                      <div className="text-[9px] text-slate-500">{preset.sub}</div>
                    </button>
                  ))}
                </div>

                {/* 0% to 100% Slider */}
                <div className="space-y-1">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={micSensitivity}
                    onChange={(e) => setMicSensitivity(parseInt(e.target.value, 10))}
                    className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                  />
                  <div className="flex justify-between items-center text-[10px] font-mono px-0.5">
                    <span className="text-amber-400 font-semibold">0% (Full Noise / ভারী আওয়াজ)</span>
                    <span className="text-slate-400">50% (Balanced)</span>
                    <span className="text-emerald-400 font-semibold">100% (No Noise / শান্ত ঘর)</span>
                  </div>
                </div>

                <p className="text-[11px] text-slate-400 leading-snug bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                  💡 <strong>টিপস:</strong> ঘরে ফ্যান, টিভি বা বাইরের আওয়াজ থাকলে স্লাইডারটি <strong>০%</strong> বা <strong>৩০%</strong>-এ রাখুন। এতে ফ্যানের শব্দে AI কোনোভাবেই অনাকাঙ্ক্ষিত বাধা পাবে না। শিক্ষার্থী স্পষ্ট করে কথা বললেই কেবল AI শুনবে।
                </p>

                {/* Extra Solutions Provided for False Interruption Prevention */}
                <div className="pt-2 border-t border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-[11px] font-semibold text-slate-200 flex items-center gap-1.5">
                        <Zap className="h-3 w-3 text-cyan-400" />
                        Acoustic Echo Shield (ইকো শিল্ড)
                      </span>
                      <span className="text-[10px] text-slate-400">
                        স্পিকারের আওয়াজ মাইক্রোফোনে ঢুকে AI থেমে যাওয়া বন্ধ রাখে
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEchoShieldEnabled(!echoShieldEnabled)}
                      className={`px-2.5 py-1 rounded-md text-[10px] font-bold border transition-all ${
                        echoShieldEnabled
                          ? 'border-emerald-500 bg-emerald-950/60 text-emerald-300'
                          : 'border-slate-700 bg-slate-800 text-slate-400'
                      }`}
                    >
                      {echoShieldEnabled ? 'ON (সক্রিয়)' : 'OFF'}
                    </button>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-400 bg-emerald-950/20 border border-emerald-500/20 p-2 rounded-lg">
                    <span>🛡️ <strong>120Hz ফ্যান ও মোটর নয়েজ ফিল্টার:</strong> অনাকাঙ্ক্ষিত কম্পন ও গুঞ্জন স্বয়ংক্রিয়ভাবে ফিল্টার করা হচ্ছে।</span>
                  </div>
                </div>

                {/* Silence Wait Window (1.25s) */}
                <div className="pt-2 border-t border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-300">
                      Silence Wait Window (বিরতির সময়সীমা)
                    </span>
                    <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
                      {silenceWait}s
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-1">
                    {[0.8, 1.0, 1.25, 1.5, 2.0].map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setSilenceWait(t)}
                        className={`py-1 rounded border text-[10px] font-medium transition-all ${
                          silenceWait === t
                            ? 'border-emerald-500 bg-emerald-950/50 text-emerald-300 shadow-sm'
                            : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800'
                        }`}
                      >
                        {t === 1.25 ? '1.25s ★' : `${t}s`}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-400 leading-tight">
                    কথা শেষ করার পর AI শিক্ষক ঠিক <strong>{silenceWait} সেকেন্ড</strong> অপেক্ষা করবেন। আপনি আর কিছু না বললে সঙ্গে সঙ্গে উত্তর দেওয়া শুরু করবেন।
                  </p>
                </div>
              </div>

              {callStatus !== 'idle' && (
                <p className="text-[11px] text-cyan-300/90 bg-cyan-950/40 p-2.5 rounded-lg border border-cyan-500/30">
                  ⚡ <strong>লাইভ টিউনিং:</strong> মডেল ও ভয়েস লক থাকলেও মাইক্রোফোন সেনসিটিভিটি (০%-১০০%), ফ্যান শিল্ড ও স্পিড কল চলাকালীন যেকোনো সময় পরিবর্তন করতে পারবেন।
                </p>
              )}
            </div>

            <div className="mt-auto pt-4 border-t border-slate-800">
              <button
                onClick={() => setShowSettings(false)}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition-colors"
              >
                Close Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Transcript Modal */}
      {showMobileTranscript && (
        <div className="fixed inset-0 z-50 flex flex-col md:hidden bg-slate-950/95 backdrop-blur-md p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h3 className="font-bold text-white text-sm">Live Dialogue Transcript</h3>
            <button
              onClick={() => setShowMobileTranscript(false)}
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-hidden py-2">
            <TranscriptView
              items={transcripts}
              onClear={() => setTranscripts([])}
              voiceName={voice}
            />
          </div>

          {/* Quick Action Touch Buttons & Chat for Mobile */}
          <div className="pt-2 border-t border-slate-800 space-y-2">
            <div className="flex items-center justify-between gap-1.5">
              <button
                type="button"
                onClick={handleNextClick}
                className="flex-1 py-1.5 px-1.5 rounded-lg border border-cyan-500/40 bg-cyan-950/60 active:scale-95 text-cyan-200 text-xs font-semibold flex items-center justify-center gap-1 shadow-sm"
              >
                <span>⏭️</span>
                <span>Next</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  sendQuickActionMessage('আগের বিষয়টি আরেকবার সহজ করে সুন্দরভাবে বুঝিয়ে দাও')
                }
                className="flex-1 py-1.5 px-1.5 rounded-lg border border-amber-500/40 bg-amber-950/60 active:scale-95 text-amber-200 text-xs font-semibold flex items-center justify-center gap-1 shadow-sm"
              >
                <span>🔁</span>
                <span>Repeat</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  sendQuickActionMessage(
                    teachingMode === 'quiz'
                      ? 'সঠিক উত্তরটি বুঝিয়ে বলো এবং পরের প্রশ্ন দাও'
                      : 'এই বিষয়টি আরেকটু গভীরে গিয়ে উদাহরণসহ বুঝিয়ে দাও'
                  )
                }
                className="flex-1 py-1.5 px-1.5 rounded-lg border border-purple-500/40 bg-purple-950/60 active:scale-95 text-purple-200 text-xs font-semibold flex items-center justify-center gap-1 shadow-sm"
              >
                <span>❓</span>
                <span>Detail</span>
              </button>
            </div>
            <form
              onSubmit={handleSendTypedMessage}
              className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-xl p-1.5 pl-2.5 focus-within:border-cyan-400"
            >
              <input
                type="text"
                value={typedMessage}
                onChange={(e) => setTypedMessage(e.target.value)}
                placeholder="মুখে বলতে না পারলে এখানে লিখুন..."
                className="flex-1 bg-transparent text-xs text-white placeholder-slate-400 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!typedMessage.trim()}
                className="px-2.5 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-xs font-semibold"
              >
                <Send className="h-3 w-3" />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
