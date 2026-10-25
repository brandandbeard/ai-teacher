import React, { useState } from 'react';
import {
  BookOpen,
  Radio,
  Cpu,
  Layers,
  Code2,
  Copy,
  Check,
  Zap,
  Volume2,
  Video,
  Wrench,
  X,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';

interface GuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GuideModal: React.FC<GuideModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'flow' | 'audio' | 'code' | 'comparison'>('overview');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  if (!isOpen) return null;

  const copySnippet = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const serverCodeSnippet = `import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { WebSocketServer } from "ws";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
});

const wss = new WebSocketServer({ port: 8080 });

wss.on("connection", async (clientWs) => {
  // 1. Establish low-latency Live session
  const session = await ai.live.connect({
    model: "gemini-3.8-live", // or "gemini-3.8-live-extended-thinking"
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
      },
      systemInstruction: "You are a concise, natural voice conversational partner.",
    },
    callbacks: {
      onmessage: (msg: LiveServerMessage) => {
        // Forward 24kHz audio chunks to client
        const audio = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
        if (audio) clientWs.send(JSON.stringify({ type: "audio", data: audio }));

        // Handle interruptions
        if (msg.serverContent?.interrupted) {
          clientWs.send(JSON.stringify({ type: "interrupted" }));
        }
      },
    },
  });

  // 2. Stream 16kHz microphone audio from client to Gemini Live
  clientWs.on("message", (raw) => {
    const { type, audio, video } = JSON.parse(raw.toString());
    if (type === "audio") {
      session.sendRealtimeInput({
        audio: { data: audio, mimeType: "audio/pcm;rate=16000" },
      });
    }
    if (type === "video") {
      // 1 frame per second JPEG
      session.sendRealtimeInput({
        video: { data: video, mimeType: "image/jpeg" },
      });
    }
  });
});`;

  const clientCodeSnippet = `// Client: Browser Audio Capture & Gapless Playback

// 1. Setup audio contexts
const inputCtx = new AudioContext({ sampleRate: 16000 });
const outputCtx = new AudioContext({ sampleRate: 24000 });
let nextStartTime = 0;
let activeSources = [];

// 2. Capture microphone (16kHz, 16-bit PCM little-endian)
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
const source = inputCtx.createMediaStreamSource(stream);
const processor = inputCtx.createScriptProcessor(4096, 1, 1);
source.connect(processor);
processor.connect(inputCtx.destination);

processor.onaudioprocess = (e) => {
  const float32 = e.inputBuffer.getChannelData(0);
  const pcm16 = convertFloat32ToPcm16Base64(float32);
  ws.send(JSON.stringify({ type: "audio", audio: pcm16 }));
};

// 3. Play model responses gaplessly at 24kHz
function playPcmChunk(base64Audio) {
  const audioBuffer = decodePcm16ToBuffer(outputCtx, base64Audio, 24000);
  const src = outputCtx.createBufferSource();
  src.buffer = audioBuffer;
  src.connect(outputCtx.destination);

  const now = outputCtx.currentTime;
  if (nextStartTime < now) nextStartTime = now + 0.025; // jitter buffer
  src.start(nextStartTime);
  nextStartTime += audioBuffer.duration;
  activeSources.push(src);
}

// 4. Instant interruption: flush audio queue
function handleInterruption() {
  activeSources.forEach(s => s.stop());
  activeSources = [];
  nextStartTime = outputCtx.currentTime;
}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 text-white shadow-lg shadow-cyan-500/20">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                How to Use Google Live (Multimodal Live API)
              </h2>
              <p className="text-xs text-slate-400">Complete architectural guide, protocols, and best practices</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/30 px-6 overflow-x-auto text-sm">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-2 py-3 px-3 font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'overview'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <BookOpen className="h-4 w-4" />
            Overview & Concepts
          </button>
          <button
            onClick={() => setActiveTab('flow')}
            className={`flex items-center gap-2 py-3 px-3 font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'flow'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Radio className="h-4 w-4" />
            Live Architecture
          </button>
          <button
            onClick={() => setActiveTab('audio')}
            className={`flex items-center gap-2 py-3 px-3 font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'audio'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Volume2 className="h-4 w-4" />
            Audio Pipeline & Sync
          </button>
          <button
            onClick={() => setActiveTab('code')}
            className={`flex items-center gap-2 py-3 px-3 font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'code'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code2 className="h-4 w-4" />
            Code Implementation
          </button>
          <button
            onClick={() => setActiveTab('comparison')}
            className={`flex items-center gap-2 py-3 px-3 font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'comparison'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="h-4 w-4" />
            API Comparison
          </button>
        </div>

        {/* Tab Contents */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-slate-300">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-5">
                <h3 className="text-base font-semibold text-cyan-300 flex items-center gap-2">
                  <Zap className="h-5 w-5 text-cyan-400" />
                  What is Google Gemini Live?
                </h3>
                <p className="mt-2 text-sm text-slate-300 leading-relaxed">
                  <strong>Gemini Multimodal Live API</strong> is Google’s state-of-the-art bidirectional, low-latency streaming
                  protocol. Unlike classic REST requests where you send a full prompt and wait for a response, Live API establishes an
                  unbroken, full-duplex session over WebSockets. You can speak freely, interrupt the AI in mid-sentence, stream camera video, and receive spoken audio back with human-like conversational responsiveness.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                  <div className="flex items-center gap-2 text-indigo-400 font-semibold text-sm mb-2">
                    <Volume2 className="h-4 w-4" />
                    Ultra-Low Latency Voice
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Generates spoken audio directly as raw 24kHz PCM packets. Turn-taking feels instantaneous without standard text-to-speech transcoding bottlenecks.
                  </p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                  <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm mb-2">
                    <Radio className="h-4 w-4" />
                    Natural Interruption
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Say "Wait, tell me more" while Gemini is talking; the model immediately detects your voice, ceases generating audio, and adapts mid-stream.
                  </p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                  <div className="flex items-center gap-2 text-cyan-400 font-semibold text-sm mb-2">
                    <Video className="h-4 w-4" />
                    Live Multimodal Vision
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Stream your webcam or screen at 1 frame per second (FPS). Gemini simultaneously observes what you are showing while talking to you about it in real-time.
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                <h4 className="text-sm font-semibold text-slate-200 mb-2">Supported Models</h4>
                <div className="space-y-2 text-xs">
                  <div className="flex items-start gap-3 p-2 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="font-mono text-cyan-400 font-bold shrink-0">gemini-3.8-live</span>
                    <span className="text-slate-300">
                      Standard real-time audio and multimodal conversation. Fast, conversational, optimized for natural dialogue.
                    </span>
                  </div>
                  <div className="flex items-start gap-3 p-2 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="font-mono text-purple-400 font-bold shrink-0">gemini-3.8-live-extended-thinking</span>
                    <span className="text-slate-300">
                      Reserved for voice sessions requiring complex reasoning, deep logic, or multi-step tool execution.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'flow' && (
            <div className="space-y-6">
              <h3 className="text-sm font-semibold text-slate-200">End-to-End WebSocket Architecture</h3>

              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-5 space-y-4 font-mono text-xs">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-lg bg-slate-900 border border-cyan-500/30">
                  <div className="text-center sm:text-left">
                    <div className="text-cyan-400 font-bold">1. Client Microphone</div>
                    <div className="text-slate-400 text-[11px]">AudioContext captures 16kHz mono PCM</div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-cyan-400 shrink-0 hidden sm:block" />
                  <div className="text-center sm:text-left">
                    <div className="text-indigo-400 font-bold">2. Node/Express Server</div>
                    <div className="text-slate-400 text-[11px]">Bridges WebSocket & protects API key</div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-indigo-400 shrink-0 hidden sm:block" />
                  <div className="text-center sm:text-left">
                    <div className="text-purple-400 font-bold">3. Google Gemini Live</div>
                    <div className="text-slate-400 text-[11px]">ai.live.connect() streaming TPU pipeline</div>
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-slate-900/80 border border-slate-800 text-slate-300 space-y-2">
                  <div className="text-white font-semibold flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-cyan-400" />
                    Crucial Protocol Steps:
                  </div>
                  <ol className="list-decimal list-inside space-y-1 text-slate-400 text-xs">
                    <li>The client opens a WebSocket connection to the server at <code className="text-cyan-300">/live-ws</code>.</li>
                    <li>The server calls <code className="text-cyan-300">ai.live.connect(&#123; model: 'gemini-3.8-live' &#125;)</code> with speech & tool configs.</li>
                    <li>Client sends raw 16kHz audio slices via <code className="text-cyan-300">session.sendRealtimeInput(&#123; audio: ... &#125;)</code>.</li>
                    <li>Gemini Live generates 24kHz raw PCM packets via <code className="text-cyan-300">onmessage</code> callback.</li>
                    <li>Client schedules chunks seamlessly on a 24kHz <code className="text-cyan-300">AudioBufferSourceNode</code> queue.</li>
                  </ol>
                </div>
              </div>

              <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4">
                <div className="flex items-center gap-2 text-amber-300 font-semibold text-sm">
                  <ShieldAlert className="h-4 w-4" />
                  Server-Side Security Requirement
                </div>
                <p className="mt-1 text-xs text-slate-300 leading-relaxed">
                  Never expose your <code className="text-amber-200">GEMINI_API_KEY</code> directly in the browser. Always establish the <code className="text-amber-200">ai.live.connect</code> session on your server (Express / Node.js) and relay sanitized WebSocket messages to the client.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'audio' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2">
                  <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-cyan-500/20 text-cyan-400">
                    INPUT AUDIO
                  </span>
                  <h4 className="text-sm font-semibold text-white">16,000 Hz, 16-bit Mono PCM</h4>
                  <ul className="text-xs text-slate-400 space-y-1 list-disc list-inside">
                    <li>Sample Rate: <strong>16,000 Hz</strong></li>
                    <li>Channels: <strong>1 (Mono)</strong></li>
                    <li>Encoding: <strong>Signed 16-bit Linear PCM Little-Endian</strong></li>
                    <li>Mime Type: <code className="text-slate-300">audio/pcm;rate=16000</code></li>
                  </ul>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2">
                  <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-500/20 text-purple-400">
                    OUTPUT AUDIO
                  </span>
                  <h4 className="text-sm font-semibold text-white">24,000 Hz, 16-bit Mono PCM</h4>
                  <ul className="text-xs text-slate-400 space-y-1 list-disc list-inside">
                    <li>Sample Rate: <strong>24,000 Hz</strong></li>
                    <li>Channels: <strong>1 (Mono)</strong></li>
                    <li>Encoding: <strong>Raw headerless PCM</strong></li>
                    <li>Must be played using Web Audio API buffer sources</li>
                  </ul>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-5 space-y-3">
                <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Volume2 className="h-4 w-4 text-cyan-400" />
                  Why Gapless Scheduling Matters
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Audio arrives over the network in continuous small chunks. If you play each chunk immediately upon arrival using <code className="text-cyan-300">source.start(0)</code>, network jitter creates noticeable popping, clicks, and gaps.
                </p>
                <div className="rounded-lg bg-slate-900 p-3 font-mono text-xs text-slate-300">
                  <div className="text-slate-400">// Correct precise timeline scheduling:</div>
                  <div>let nextStartTime = 0;</div>
                  <div>const now = audioCtx.currentTime;</div>
                  <div>if (nextStartTime &lt; now) nextStartTime = now + 0.025; // 25ms buffer</div>
                  <div>source.start(nextStartTime);</div>
                  <div>nextStartTime += audioBuffer.duration;</div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'code' && (
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Server Implementation (server.ts / Node.js)
                  </h4>
                  <button
                    onClick={() => copySnippet('server', serverCodeSnippet)}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                  >
                    {copiedCode === 'server' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedCode === 'server' ? 'Copied' : 'Copy Code'}
                  </button>
                </div>
                <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300 overflow-x-auto leading-relaxed max-h-64">
                  <code>{serverCodeSnippet}</code>
                </pre>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Client Audio Capture & Playback (Browser)
                  </h4>
                  <button
                    onClick={() => copySnippet('client', clientCodeSnippet)}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                  >
                    {copiedCode === 'client' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedCode === 'client' ? 'Copied' : 'Copy Code'}
                  </button>
                </div>
                <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300 overflow-x-auto leading-relaxed max-h-64">
                  <code>{clientCodeSnippet}</code>
                </pre>
              </div>
            </div>
          )}

          {activeTab === 'comparison' && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-200">How Live Compares to Other Gemini APIs</h3>

              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 font-semibold">
                    <tr>
                      <th className="p-3">Feature</th>
                      <th className="p-3 text-cyan-400">Gemini Live API</th>
                      <th className="p-3">Chat / generateContent</th>
                      <th className="p-3">Standard TTS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-900/40 text-slate-300">
                    <tr>
                      <td className="p-3 font-medium text-white">Transport Protocol</td>
                      <td className="p-3 font-semibold text-cyan-300">Full-duplex WebSocket</td>
                      <td className="p-3">HTTP / REST / SSE</td>
                      <td className="p-3">HTTP Unary or Stream</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-medium text-white">Turn Latency</td>
                      <td className="p-3 font-semibold text-emerald-400">Sub-second (&lt;500ms)</td>
                      <td className="p-3">1 - 3 seconds</td>
                      <td className="p-3">800ms - 2 seconds</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-medium text-white">Barge-in / Interruption</td>
                      <td className="p-3 font-semibold text-emerald-400">Native realtime</td>
                      <td className="p-3">Not supported</td>
                      <td className="p-3">Manual abort</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-medium text-white">Multimodal Vision</td>
                      <td className="p-3 font-semibold text-cyan-300">Live 1 FPS streaming</td>
                      <td className="p-3">Static image uploads</td>
                      <td className="p-3">None (Text input only)</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-medium text-white">Function Calling</td>
                      <td className="p-3 font-semibold text-cyan-300">Realtime mid-speech</td>
                      <td className="p-3">Turn-based</td>
                      <td className="p-3">N/A</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-800 bg-slate-950/80 px-6 py-4 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            Powered by <span className="font-mono text-cyan-400">@google/genai</span> Live API
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-gradient-to-r from-cyan-500 to-indigo-600 text-white hover:brightness-110 shadow-lg shadow-cyan-500/20 transition-all"
          >
            Start Conversation
          </button>
        </div>
      </div>
    </div>
  );
};
