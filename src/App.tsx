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
  const [systemInstruction, setSystemInstruction] = useState<string>(SHREYA_MAAM_PROMPT);
  const [backendHost] = useState<string>(() => getSavedBackendHost());

  // Audio & Video State
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [isScreenEnabled, setIsScreenEnabled] = useState(false);
  const [userVolume, setUserVolume] = useState(0);
  const [aiVolume, setAiVolume] = useState(0);

  // Speed & Sensitivity Controls
  const [speechSpeed, setSpeechSpeed] = useState<number>(1.0);
  const [micSensitivity, setMicSensitivity] = useState<number>(60); // Balanced by default (60%)
  const [silenceWait, setSilenceWait] = useState<number>(1.25); // Silence pause wait time in seconds (Default 1.25s)

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

  // Sync silence wait timeout dynamically
  useEffect(() => {
    audioRecorderRef.current?.setSilenceWaitMs(Math.round(silenceWait * 1000));
  }, [silenceWait]);

  // Initialize Audio Player on mount
  useEffect(() => {
    audioPlayerRef.current = new LiveAudioPlayer();
    audioPlayerRef.current.setPlaybackRate(speechSpeed);
    audioRecorderRef.current = new LiveAudioRecorder();
    audioRecorderRef.current.setSensitivity(micSensitivity);
    audioRecorderRef.current.setSilenceWaitMs(Math.round(silenceWait * 1000));

    return () => {
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

  // Arm 22s silence auto-disconnect timer (saves quota if student sleeps/leaves)
  const armInactivityTimer = useCallback((delayMs = 22000) => {
    clearInactivityTimer();
    inactivityTimeoutRef.current = window.setTimeout(() => {
      if (callStatusRef.current !== 'idle') {
        stopCall();
        setStatusMessage('কোনো সাড়া না পাওয়ায় কল বিচ্ছিন্ন হয়েছে');
        setErrorMessage('ছাত্রের কোনো সাড়া না পাওয়ায় AI কোটা সংরক্ষণের জন্য কলটি স্বয়ংক্রিয়ভাবে ডিসকানেক্ট করা হয়েছে।');
        addTranscript('system', 'ছাত্র কোনো উত্তর না দেওয়ায় AI কোটা অপচয় রোধ করতে কলটি স্বয়ংক্রিয়ভাবে ডিসকানেক্ট করা হলো।');
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
        const effectiveInstruction = systemInstruction.includes('NON-STOP CONTINUOUS TEACHING')
          ? systemInstruction + speedInstruction
          : `${systemInstruction}\n\n${NON_STOP_TEACHING_SYSTEM_RULE}${speedInstruction}`;

        // Dispatch session start config with resumption token if available
        ws.send(
          JSON.stringify({
            type: 'start',
            model,
            voice,
            systemInstruction: effectiveInstruction,
            resumeHandle: lastResumptionHandleRef.current || undefined,
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
            return;
          }

          if (msg.type === 'go_away') {
            setStatusMessage(`Server cycle warning (Time left: ${msg.timeLeft || '60s'}). Auto-resuming...`);
            return;
          }

          if (msg.type === 'session_timeout') {
            if (msg.handle) {
              lastResumptionHandleRef.current = msg.handle;
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
              setCallStatus('active');
              setStatusMessage('Live conversation active. Speak freely!');
              if (msg.resumptionHandle) {
                lastResumptionHandleRef.current = msg.resumptionHandle;
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
            setChunksReceived((c) => c + 1);
            audioPlayerRef.current?.playChunk(msg.data);
          }

          if (msg.type === 'model_transcript' && msg.text) {
            // Append model speech transcript
            addTranscript('gemini', msg.text);
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
            audioPlayerRef.current?.stopAndClear();
            setCallStatus('interrupted');
            setStatusMessage('Interrupted. AI stopped speaking.');
            addTranscript('system', 'AI interrupted by user');
            setTimeout(() => setCallStatus('active'), 1200);
          }

          if (msg.type === 'turn_complete') {
            // Model finished speaking turn
            setStatusMessage('Listening to you...');
            armInactivityTimer(22000); // Auto-disconnect if 22s silent after question
          }

          if (msg.type === 'error') {
            setErrorMessage(msg.message);
            setStatusMessage('Error encountered.');
            addTranscript('system', `Error: ${msg.message}`);
          }
        } catch (err) {
          console.error('Error handling WebSocket message:', err);
        }
      };

      ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        setErrorMessage('Connection issue detected. Please check network connectivity and microphone access.');
      };

      ws.onclose = () => {
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

  // Send typed prompt directly into the Live session
  const handleSendTypedMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!typedMessage.trim()) return;

    const text = typedMessage.trim();
    clearInactivityTimer();
    setTypedMessage('');
    addTranscript('user', text);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'text',
          text,
        })
      );
    } else {
      // If call not active, start call with this message
      startCall().then(() => {
        setTimeout(() => {
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'text', text }));
          }
        }, 1500);
      });
    }
  };

  const selectedVoiceMeta = VOICES.find((v) => v.id === voice) || VOICES[0];

  return (
    <div className="flex h-screen w-full flex-col bg-slate-950 text-slate-100 overflow-hidden font-sans">
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
      <div className="flex flex-1 overflow-hidden relative">
        {/* Left Side: Call Stage / Visualizer */}
        <div className="flex-1 flex flex-col justify-between p-4 sm:p-6 overflow-y-auto">
          {/* Quick Info Bar */}
          <div className="flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 bg-slate-900/80 px-2.5 py-1 rounded-md border border-slate-800">
                <Cpu className="h-3.5 w-3.5 text-indigo-400" />
                <span className="font-mono text-slate-200">
                  {model === 'gemini-3.8-live' ? 'Model 1' : 'Model 2'}
                </span>
              </span>
              <span className="flex items-center gap-1.5 bg-slate-900/80 px-2.5 py-1 rounded-md border border-slate-800">
                <Volume2 className="h-3.5 w-3.5 text-cyan-400" />
                <span>Voice:</span>
                <strong className="text-white">{voice}</strong>
              </span>
              <button
                type="button"
                onClick={() => {
                  const speeds = [0.85, 1.0, 1.15, 1.25];
                  const currentIdx = speeds.indexOf(speechSpeed);
                  const nextSpeed = currentIdx === -1 || currentIdx === speeds.length - 1 ? speeds[0] : speeds[currentIdx + 1];
                  setSpeechSpeed(nextSpeed);
                }}
                className="flex items-center gap-1.5 bg-slate-900/80 hover:bg-slate-800 px-2.5 py-1 rounded-md border border-slate-800 text-slate-300 hover:text-white transition-colors"
                title="Click to cycle Speech Speed (0.85x, 1.0x, 1.15x, 1.25x)"
              >
                <Gauge className="h-3.5 w-3.5 text-amber-400" />
                <span>Speed:</span>
                <strong className="text-amber-300 font-mono">{speechSpeed}x</strong>
              </button>
            </div>

            {callStatus !== 'idle' && (
              <div className="flex items-center gap-3 text-[11px] font-mono text-slate-500">
                <span className="text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30 flex items-center gap-1">
                  <RefreshCw className="h-3 w-3 animate-spin" style={{ animationDuration: '8s' }} />
                  <span>Auto-Renew in {Math.max(0, 240 - (callDuration % 240))}s</span>
                </span>
                <span className="hidden sm:inline">Audio In: 16kHz</span>
                <span className="hidden sm:inline">Audio Out: 24kHz</span>
                <span>Chunks: {chunksReceived}</span>
              </div>
            )}
          </div>

          {/* Central Interactive Orb & Stage */}
          <div className="my-auto flex flex-col items-center justify-center py-6 relative">
            {/* Hidden Video Canvas for Frame Streaming */}
            <video
              ref={videoRef}
              playsInline
              muted
              className={`rounded-2xl border-2 border-cyan-500/40 shadow-2xl bg-black mb-4 transition-all duration-300 ${
                isVideoEnabled || isScreenEnabled ? 'w-64 h-48 object-cover' : 'hidden'
              }`}
            />

            {(isVideoEnabled || isScreenEnabled) && (
              <div className="mb-4 flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-[11px] text-cyan-300">
                <Eye className="h-3.5 w-3.5 animate-pulse text-cyan-400" />
                <span>Streaming visual frames at 1 FPS to Gemini Live</span>
              </div>
            )}

            {/* Audio Reactive Orb */}
            <AudioOrb
              status={callStatus}
              userVolume={userVolume}
              aiVolume={aiVolume}
              size={260}
            />

            {/* Status Text & Subtitle */}
            <div className="mt-4 text-center">
              <p className="text-sm font-semibold text-slate-200 tracking-wide">{statusMessage}</p>
              <p className="text-xs text-slate-500 mt-1 max-w-md">
                {callStatus === 'idle'
                  ? 'Click "Start Live Call" to start duplex real-time speech conversation.'
                  : 'Speak into your microphone. Say anything or ask questions to interrupt and converse.'}
              </p>
            </div>

            {/* Quick Starter Conversation Prompts - Strictly Separated Sections */}
            {callStatus === 'idle' && (
              <div className="mt-5 w-full max-w-3xl space-y-3">
                {/* 1. WBBSE (Class V - X) */}
                <div className="rounded-2xl border border-emerald-500/40 bg-gradient-to-r from-emerald-950/40 via-slate-900/60 to-emerald-950/40 p-3 shadow-lg shadow-emerald-950/20">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <span className="text-[11px] sm:text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                      <BookOpen className="h-3.5 w-3.5" />
                      WBBSE (Class V - X)
                    </span>
                    <span className="text-[9px] sm:text-[10px] text-emerald-300 bg-emerald-950/90 border border-emerald-500/40 px-2 py-0.5 rounded-full font-medium shadow-sm">
                      বাংলা পাঠ্যবই
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      onClick={() => {
                        setVoice('Charon');
                        setSystemInstruction(WBBSE_HISTORY_PROMPT);
                        startCall();
                      }}
                      className="px-3 py-2 rounded-xl border border-emerald-500/40 bg-emerald-950/60 hover:bg-emerald-900/70 text-emerald-200 text-xs font-semibold transition-all shadow-sm shadow-emerald-500/10 hover:scale-[1.02] flex items-center justify-center gap-1.5 text-center"
                    >
                      <span>📖</span>
                      <span>ইতিহাস (Class V - X)</span>
                    </button>
                    <button
                      onClick={() => {
                        setVoice('Kore');
                        setSystemInstruction(WBBSE_SCIENCE_PROMPT);
                        startCall();
                      }}
                      className="px-3 py-2 rounded-xl border border-emerald-500/40 bg-emerald-950/60 hover:bg-emerald-900/70 text-emerald-200 text-xs font-semibold transition-all shadow-sm shadow-emerald-500/10 hover:scale-[1.02] flex items-center justify-center gap-1.5 text-center"
                    >
                      <span>🔬</span>
                      <span>বিজ্ঞান (ভৌত+জীবন · Class V - X)</span>
                    </button>
                    <button
                      onClick={() => {
                        setVoice('Charon');
                        setSystemInstruction(WBBSE_GEOGRAPHY_PROMPT);
                        startCall();
                      }}
                      className="px-3 py-2 rounded-xl border border-emerald-500/40 bg-emerald-950/60 hover:bg-emerald-900/70 text-emerald-200 text-xs font-semibold transition-all shadow-sm shadow-emerald-500/10 hover:scale-[1.02] flex items-center justify-center gap-1.5 text-center"
                    >
                      <span>🗺️</span>
                      <span>ভূগোল (Class V - X)</span>
                    </button>
                  </div>
                </div>

                {/* 2. Competitive & Spoken */}
                <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <span className="text-[11px] sm:text-xs font-bold text-amber-400 flex items-center gap-1.5">
                      <GraduationCap className="h-3.5 w-3.5" />
                      Competitive & Spoken
                    </span>
                    <span className="text-[9px] text-amber-400/80 bg-amber-950/60 border border-amber-500/30 px-2 py-0.5 rounded-full font-medium">
                      বিষয়সমূহ
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-1.5">
                    <button
                      onClick={() => {
                        setVoice('Kore');
                        setSystemInstruction(SHREYA_MAAM_PROMPT);
                        startCall();
                      }}
                      className="px-2.5 py-1 rounded-lg border border-amber-500/30 bg-amber-950/30 hover:bg-amber-900/40 text-amber-300 text-[11px] font-medium transition-colors"
                    >
                      🗣️ Spoken English
                    </button>
                    <button
                      onClick={() => {
                        setVoice('Charon');
                        setSystemInstruction(BHATTACHARYA_SIR_PROMPT);
                        startCall();
                      }}
                      className="px-2.5 py-1 rounded-lg border border-amber-500/30 bg-amber-950/30 hover:bg-amber-900/40 text-amber-300 text-[11px] font-medium transition-colors"
                    >
                      📜 Indian History
                    </button>
                    <button
                      onClick={() => {
                        setVoice('Charon');
                        setSystemInstruction(SARMAD_MEHRAJ_SIR_PROMPT);
                        startCall();
                      }}
                      className="px-2.5 py-1 rounded-lg border border-cyan-500/30 bg-cyan-950/30 hover:bg-cyan-900/40 text-cyan-300 text-[11px] font-medium transition-colors"
                    >
                      ⚖️ Polity & Constitution
                    </button>
                    <button
                      onClick={() => {
                        setVoice('Puck');
                        setSystemInstruction(MRUNAL_PATEL_SIR_PROMPT);
                        startCall();
                      }}
                      className="px-2.5 py-1 rounded-lg border border-emerald-500/30 bg-emerald-950/30 hover:bg-emerald-900/40 text-emerald-300 text-[11px] font-medium transition-colors"
                    >
                      📈 Indian Economy
                    </button>
                    <button
                      onClick={() => {
                        setVoice('Fenrir');
                        setSystemInstruction(SUDARSHAN_GURJAR_SIR_PROMPT);
                        startCall();
                      }}
                      className="px-2.5 py-1 rounded-lg border border-blue-500/30 bg-blue-950/30 hover:bg-blue-900/40 text-blue-300 text-[11px] font-medium transition-colors"
                    >
                      🌍 Geography & Astronomy
                    </button>
                    <button
                      onClick={() => {
                        setVoice('Fenrir');
                        setSystemInstruction(DR_SENGUPTA_PROMPT);
                        startCall();
                      }}
                      className="px-2.5 py-1 rounded-lg border border-teal-500/30 bg-teal-950/30 hover:bg-teal-900/40 text-teal-300 text-[11px] font-medium transition-colors"
                    >
                      🔬 Science & Technology
                    </button>
                    <button
                      onClick={() => {
                        setVoice('Charon');
                        setSystemInstruction(ADHIKARI_SIR_PROMPT);
                        startCall();
                      }}
                      className="px-2.5 py-1 rounded-lg border border-purple-500/30 bg-purple-950/30 hover:bg-purple-900/40 text-purple-300 text-[11px] font-medium transition-colors"
                    >
                      🏛️ Static GK
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

            {/* Bottom Live Call Controls Toolbar */}
            <div className="flex flex-col items-center gap-3 sm:gap-4 w-full">
              <div className="flex items-center gap-1 sm:gap-2.5 p-1.5 sm:p-2 rounded-2xl border border-slate-800/90 bg-slate-900/80 backdrop-blur-md shadow-2xl max-w-full overflow-x-auto no-scrollbar justify-center">
                {/* Mic Toggle */}
                <button
                  onClick={toggleMic}
                  disabled={callStatus === 'idle'}
                  className={`p-2 sm:p-3 rounded-xl border transition-all ${
                    isMicMuted
                      ? 'border-red-500/50 bg-red-950/40 text-red-400'
                      : 'border-slate-700 bg-slate-800/80 text-white hover:bg-slate-700'
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                  title={isMicMuted ? 'Unmute Microphone' : 'Mute Microphone'}
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

              {/* In-Call Text Input Bar */}
              <form
                onSubmit={handleSendTypedMessage}
                className="w-full max-w-xl flex items-center gap-1.5 sm:gap-2 bg-slate-900/70 border border-slate-800 rounded-xl p-1.5 pl-2.5 sm:pl-3 focus-within:border-cyan-500"
              >
                <input
                  type="text"
                  value={typedMessage}
                  onChange={(e) => setTypedMessage(e.target.value)}
                  placeholder="Or type a message directly into the live conversation..."
                  className="flex-1 bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!typedMessage.trim()}
                  className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-xs font-semibold transition-all flex items-center gap-1 shrink-0"
                >
                  <Send className="h-3 w-3" />
                  <span className="hidden xs:inline">Send</span>
                </button>
              </form>
            </div>
          </div>

        {/* Right Side: Live Transcript View */}
        <div className="w-80 lg:w-96 border-l border-slate-800/80 bg-slate-950/40 flex flex-col p-4 shrink-0 hidden md:flex">
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

              {/* Microphone Sensitivity & Voice Detection */}
              <div className="bg-slate-950/40 p-3.5 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <Sliders className="h-3.5 w-3.5 text-cyan-400" />
                    Microphone Sensitivity (Wide Range)
                  </label>
                  <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-500/30">
                    {micSensitivity >= 90 ? 'Ultra' : micSensitivity >= 75 ? 'High' : micSensitivity >= 50 ? 'Balanced' : 'Low'} ({micSensitivity}%)
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { label: 'Low', val: 30 },
                    { label: 'Balanced', val: 60 },
                    { label: 'High (Fast)', val: 80 },
                    { label: 'Ultra', val: 95 },
                  ].map((preset) => (
                    <button
                      key={preset.val}
                      type="button"
                      onClick={() => setMicSensitivity(preset.val)}
                      className={`py-1.5 px-1 text-center rounded-lg border text-[11px] font-medium transition-all ${
                        micSensitivity === preset.val
                          ? 'border-cyan-500 bg-cyan-950/50 text-cyan-300 shadow-sm shadow-cyan-500/20'
                          : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <input
                  type="range"
                  min="10"
                  max="100"
                  step="5"
                  value={micSensitivity}
                  onChange={(e) => setMicSensitivity(parseInt(e.target.value, 10))}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                />
                <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                  <span>10% (Ignores noise)</span>
                  <span>60% (Balanced)</span>
                  <span>100% (Instant capture)</span>
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
                <p className="text-[11px] text-amber-400/80 bg-amber-950/30 p-2.5 rounded-lg border border-amber-500/20">
                  Settings are locked during an active call. End the call to adjust model or voice configuration.
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
          <div className="flex-1 overflow-hidden pt-3">
            <TranscriptView
              items={transcripts}
              onClear={() => setTranscripts([])}
              voiceName={voice}
            />
          </div>
        </div>
      )}
    </div>
  );
}
