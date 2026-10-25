/**
 * Audio processing utilities for Gemini Live API
 *
 * Input: 16kHz 16-bit Mono Linear PCM (Little-Endian)
 * Output: 24kHz 16-bit Mono Linear PCM (Little-Endian)
 */

export class LiveAudioPlayer {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private nextStartTime = 0;
  private activeSources: AudioBufferSourceNode[] = [];
  private isMuted = false;
  private playbackRate = 1.0;

  constructor() {
    // Lazily initialized on user gesture
  }

  public setPlaybackRate(rate: number) {
    this.playbackRate = Math.max(0.65, Math.min(1.5, rate));
    for (const source of this.activeSources) {
      try {
        source.playbackRate.value = this.playbackRate;
      } catch (e) {}
    }
  }

  public getPlaybackRate(): number {
    return this.playbackRate;
  }

  public init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx({ sampleRate: 24000 });
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;
      this.analyser.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  public playChunk(base64Pcm: string) {
    this.init();
    if (!this.ctx || !this.analyser || this.isMuted) return;

    try {
      const binary = atob(base64Pcm);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      // Convert 16-bit signed PCM to float32
      const int16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / (int16[i] < 0 ? 32768 : 32767);
      }

      const audioBuffer = this.ctx.createBuffer(1, float32.length, 24000);
      audioBuffer.getChannelData(0).set(float32);

      const source = this.ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.playbackRate.value = this.playbackRate;
      source.connect(this.analyser);

      const currentTime = this.ctx.currentTime;
      // Schedule gapless playback with a small 25ms jitter buffer
      if (this.nextStartTime < currentTime) {
        this.nextStartTime = currentTime + 0.025;
      }

      source.start(this.nextStartTime);
      const effectiveDuration = audioBuffer.duration / this.playbackRate;
      this.nextStartTime += effectiveDuration;

      this.activeSources.push(source);
      source.onended = () => {
        const idx = this.activeSources.indexOf(source);
        if (idx !== -1) {
          this.activeSources.splice(idx, 1);
        }
      };
    } catch (err) {
      console.error('Error decoding/playing audio chunk:', err);
    }
  }

  public stopAndClear() {
    this.activeSources.forEach((s) => {
      try {
        s.stop();
        s.disconnect();
      } catch (e) {}
    });
    this.activeSources = [];
    if (this.ctx) {
      this.nextStartTime = this.ctx.currentTime;
    } else {
      this.nextStartTime = 0;
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted) {
      this.stopAndClear();
    }
  }

  public getVolumeLevel(): number {
    if (!this.analyser) return 0;
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i];
    }
    return sum / (data.length * 255);
  }

  public close() {
    this.stopAndClear();
    if (this.ctx) {
      try {
        this.ctx.close();
      } catch (e) {}
      this.ctx = null;
      this.analyser = null;
    }
  }
}

export class LiveAudioRecorder {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private onDataCallback: ((base64Pcm: string) => void) | null = null;
  private onSilenceFiltered: (() => void) | null = null;
  private onSpeechStateChange: ((isSpeaking: boolean) => void) | null = null;
  private onTurnComplete: (() => void) | null = null;
  private isPaused = false;

  // Adaptive Voice Activity Detection parameters
  private vadEnabled = true;
  private sensitivityLevel = 75; // Wide range: 10 (low / noisy) to 100 (ultra sensitive)
  private silenceWaitMs = 1250; // User-requested silence threshold: exactly 1.25s
  private noiseFloor = 0.007; // Dynamic background noise floor
  private isUserSpeaking = false;
  private lastSpeechTime = 0;
  private consecutiveSpeechFrames = 0;
  private preRollBuffer: string[] = []; // Circular buffer of last 2 frames (~250ms) before speech to prevent clipping the first syllable

  public isRecording(): boolean {
    return Boolean(this.stream && this.stream.active && this.processor);
  }

  public setVadEnabled(enabled: boolean) {
    this.vadEnabled = enabled;
  }

  public isVadEnabled(): boolean {
    return this.vadEnabled;
  }

  public setSensitivity(level: number) {
    this.sensitivityLevel = Math.max(10, Math.min(100, level));
  }

  public getSensitivity(): number {
    return this.sensitivityLevel;
  }

  public setSilenceWaitMs(ms: number) {
    this.silenceWaitMs = Math.max(500, Math.min(3000, ms));
  }

  public getSilenceWaitMs(): number {
    return this.silenceWaitMs;
  }

  public setVadThreshold(threshold: number) {
    // Maps legacy threshold calls (0.009 - 0.030) to sensitivity percentage (10 - 100)
    const level = Math.round(100 - ((threshold - 0.008) / 0.022) * 80);
    this.setSensitivity(level);
  }

  public setSpeechStateCallback(cb: (isSpeaking: boolean) => void) {
    this.onSpeechStateChange = cb;
  }

  public setTurnCompleteCallback(cb: () => void) {
    this.onTurnComplete = cb;
  }

  public setSilenceCallback(cb: () => void) {
    this.onSilenceFiltered = cb;
  }

  public updateCallback(onData: (base64Pcm: string) => void) {
    this.onDataCallback = onData;
  }

  public async start(
    onData: (base64Pcm: string) => void,
    onSilence?: () => void,
    onSpeechChange?: (isSpeaking: boolean) => void,
    onTurnEnd?: () => void
  ) {
    this.onDataCallback = onData;
    if (onSilence) this.onSilenceFiltered = onSilence;
    if (onSpeechChange) this.onSpeechStateChange = onSpeechChange;
    if (onTurnEnd) this.onTurnComplete = onTurnEnd;

    this.isUserSpeaking = false;
    this.lastSpeechTime = 0;
    this.consecutiveSpeechFrames = 0;
    this.preRollBuffer = [];

    // If stream is already active (e.g. during a session refresh/reconnect), keep it running seamlessly!
    if (this.isRecording()) {
      if (this.ctx && this.ctx.state === 'suspended') {
        try {
          await this.ctx.resume();
        } catch (e) {}
      }
      return;
    }

    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;

    // Use 16kHz audio context for microphone capture
    this.ctx = new AudioCtx({ sampleRate: 16000 });
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.source.connect(this.analyser);

    // Buffer size of 2048 gives ~128ms frames at 16kHz for lightning-fast voice detection
    this.processor = this.ctx.createScriptProcessor(2048, 1, 1);
    this.analyser.connect(this.processor);
    this.processor.connect(this.ctx.destination);

    this.processor.onaudioprocess = (e) => {
      if (this.isPaused) return;
      const inputBuffer = e.inputBuffer.getChannelData(0);

      // 1. Calculate RMS energy and Peak amplitude
      let sumSquares = 0;
      let peak = 0;
      for (let i = 0; i < inputBuffer.length; i++) {
        const val = inputBuffer[i];
        sumSquares += val * val;
        const abs = Math.abs(val);
        if (abs > peak) peak = abs;
      }
      const rms = Math.sqrt(sumSquares / inputBuffer.length);
      const now = Date.now();

      // 2. Adaptive noise floor calculation (when user is not speaking)
      if (!this.isUserSpeaking) {
        this.noiseFloor = this.noiseFloor * 0.92 + rms * 0.08;
      }

      // 3. Dynamic Threshold derived from user sensitivity:
      // High sensitivity (75-95%): threshold is close to noise floor (~noiseFloor + 0.005)
      // Low sensitivity (15-35%): threshold requires strong voice (~noiseFloor + 0.025)
      const sensitivityFactor = (105 - this.sensitivityLevel) / 100; // 0.05 to 0.95
      const speechOnsetThreshold = Math.max(0.009, this.noiseFloor * 1.25 + sensitivityFactor * 0.022);
      const speechSustainThreshold = Math.max(0.006, this.noiseFloor * 1.1 + sensitivityFactor * 0.014);

      const isCurrentFrameVoice = this.isUserSpeaking
        ? (rms >= speechSustainThreshold || peak >= 0.06)
        : (rms >= speechOnsetThreshold || peak >= 0.08);

      const base64Chunk = this.float32ToPcm16Base64(inputBuffer);

      if (isCurrentFrameVoice) {
        this.consecutiveSpeechFrames++;
        this.lastSpeechTime = now;

        // Trigger speech onset if 2 consecutive frames or clear speech peak
        if (!this.isUserSpeaking && (this.consecutiveSpeechFrames >= 2 || peak >= 0.12)) {
          this.isUserSpeaking = true;
          if (this.onSpeechStateChange) {
            this.onSpeechStateChange(true);
          }
          // Flush pre-roll buffer so the very beginning of the first word isn't lost
          if (this.onDataCallback) {
            for (const preChunk of this.preRollBuffer) {
              this.onDataCallback(preChunk);
            }
          }
          this.preRollBuffer = [];
        }

        // Send active voice frame
        if (this.isUserSpeaking && this.onDataCallback) {
          this.onDataCallback(base64Chunk);
        }
      } else {
        this.consecutiveSpeechFrames = 0;

        if (this.isUserSpeaking) {
          const silenceDuration = now - this.lastSpeechTime;

          if (silenceDuration < this.silenceWaitMs) {
            // User paused briefly (thinking or taking breath): continue streaming
            if (this.onDataCallback) {
              this.onDataCallback(base64Chunk);
            }
          } else {
            // Exactly 1.25s silence reached: user has finished speaking!
            this.isUserSpeaking = false;
            if (this.onSpeechStateChange) {
              this.onSpeechStateChange(false);
            }
            if (this.onTurnComplete) {
              this.onTurnComplete();
            }
            if (this.onSilenceFiltered) {
              this.onSilenceFiltered();
            }
          }
        } else {
          // Keep circular pre-roll buffer of last 2 quiet frames (~250ms)
          this.preRollBuffer.push(base64Chunk);
          if (this.preRollBuffer.length > 2) {
            this.preRollBuffer.shift();
          }
          if (this.onSilenceFiltered) {
            this.onSilenceFiltered();
          }
        }
      }
    };
  }

  private float32ToPcm16Base64(input: Float32Array): string {
    const buffer = new ArrayBuffer(input.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); // Little-endian
    }

    const bytes = new Uint8Array(buffer);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  public getVolumeLevel(): number {
    if (!this.analyser || this.isPaused) return 0;
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i];
    }
    return sum / (data.length * 255);
  }

  public pause() {
    this.isPaused = true;
  }

  public resume() {
    this.isPaused = false;
  }

  public isMuted(): boolean {
    return this.isPaused;
  }

  public stop() {
    if (this.processor) {
      try {
        this.processor.disconnect();
      } catch (e) {}
      this.processor = null;
    }
    if (this.source) {
      try {
        this.source.disconnect();
      } catch (e) {}
      this.source = null;
    }
    if (this.analyser) {
      try {
        this.analyser.disconnect();
      } catch (e) {}
      this.analyser = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    if (this.ctx) {
      try {
        this.ctx.close();
      } catch (e) {}
      this.ctx = null;
    }
    this.onDataCallback = null;
    this.isPaused = false;
  }
}
