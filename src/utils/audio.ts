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
  private lastChunkTime = 0;

  private leftoverBytes: Uint8Array | null = null;

  constructor() {
    // Lazily initialized on user gesture
  }

  public isPlaying(): boolean {
    if (!this.ctx) return false;
    return this.activeSources.length > 0 && this.nextStartTime > this.ctx.currentTime;
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
      try {
        // Prefer default hardware sample rate for zero buffer underruns on mobile
        this.ctx = new AudioCtx();
      } catch (e) {
        this.ctx = new AudioCtx({ sampleRate: 24000 });
      }
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
    this.lastChunkTime = Date.now();

    try {
      const binary = atob(base64Pcm);
      const len = binary.length;
      if (len === 0) return;

      const rawBytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        rawBytes[i] = binary.charCodeAt(i);
      }

      // Safely stitch any leftover dangling byte from previous packet
      // to ensure 16-bit PCM word alignment is never corrupted and RangeError is never thrown
      let totalBytes: Uint8Array;
      if (this.leftoverBytes && this.leftoverBytes.length > 0) {
        totalBytes = new Uint8Array(this.leftoverBytes.length + len);
        totalBytes.set(this.leftoverBytes, 0);
        totalBytes.set(rawBytes, this.leftoverBytes.length);
        this.leftoverBytes = null;
      } else {
        totalBytes = rawBytes;
      }

      // If odd number of bytes, save the trailing byte for the next chunk
      const remainder = totalBytes.length % 2;
      if (remainder !== 0) {
        this.leftoverBytes = totalBytes.slice(totalBytes.length - remainder);
        totalBytes = totalBytes.subarray(0, totalBytes.length - remainder);
      }

      if (totalBytes.length === 0) return;

      // Convert 16-bit signed PCM (little-endian) to float32
      const int16 = new Int16Array(
        totalBytes.buffer,
        totalBytes.byteOffset,
        totalBytes.length / 2
      );
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / (int16[i] < 0 ? 32768 : 32767);
      }

      // AudioBuffer created at 24000Hz (native Gemini Live output rate)
      const audioBuffer = this.ctx.createBuffer(1, float32.length, 24000);
      audioBuffer.getChannelData(0).set(float32);

      const source = this.ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.playbackRate.value = this.playbackRate;
      source.connect(this.analyser);

      const currentTime = this.ctx.currentTime;
      const effectiveDuration = audioBuffer.duration / this.playbackRate;

      // Seamless scheduling:
      // If nextStartTime has fallen behind currentTime:
      if (this.nextStartTime < currentTime) {
        const gap = currentTime - this.nextStartTime;
        // If there has been a real silence (> 150ms between turns), give a tiny 20ms lead time
        // If it's just minor network jitter (< 150ms during continuous speech), play immediately (+3ms)
        // to prevent artificial 60ms dead silences that drop syllables and words mid-speech!
        this.nextStartTime = currentTime + (gap > 0.150 ? 0.020 : 0.003);
      }

      source.start(this.nextStartTime);
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
    this.lastChunkTime = 0;
    this.leftoverBytes = null;
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
  private filter: BiquadFilterNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private onDataCallback: ((base64Pcm: string) => void) | null = null;
  private onSilenceFiltered: (() => void) | null = null;
  private onSpeechStateChange: ((isSpeaking: boolean) => void) | null = null;
  private onTurnComplete: (() => void) | null = null;
  private isPaused = false;

  // Adaptive Voice Activity Detection parameters
  private vadEnabled = true;
  private sensitivityLevel = 50; // 0 (Full Noise / Maximum suppression) to 100 (No Noise / Delicate sensitivity)
  private silenceWaitMs = 750; // Low-latency turn turnaround: 750ms
  private noiseFloor = 0.007; // Dynamic background noise floor
  private isUserSpeaking = false;
  private lastSpeechTime = 0;
  private consecutiveSpeechFrames = 0;
  private preRollBuffer: string[] = []; // Circular buffer of last 5 frames (~640ms) to guarantee zero clipped syllables

  // Acoustic Echo Shield & Anti-Interruption Guard
  private isAiSpeakingCallback: (() => boolean) | null = null;
  private echoGuardEnabled = true;

  public isRecording(): boolean {
    return Boolean(this.stream && this.stream.active && this.processor);
  }

  public isSpeaking(): boolean {
    return this.isUserSpeaking;
  }

  public getNoiseFloor(): number {
    return this.noiseFloor;
  }

  public setAiSpeakingCallback(cb: () => boolean) {
    this.isAiSpeakingCallback = cb;
  }

  public setEchoGuardEnabled(enabled: boolean) {
    this.echoGuardEnabled = enabled;
  }

  public isEchoGuardEnabled(): boolean {
    return this.echoGuardEnabled;
  }

  public setVadEnabled(enabled: boolean) {
    this.vadEnabled = enabled;
  }

  public isVadEnabled(): boolean {
    return this.vadEnabled;
  }

  public setSensitivity(level: number) {
    // Clamped strictly between 0 and 100
    this.sensitivityLevel = Math.max(0, Math.min(100, Math.round(level)));
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

    // 120Hz highpass filter to strip fan rumble, room hum, and mechanical vibrations
    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = 'highpass';
    this.filter.frequency.value = 120;
    this.filter.Q.value = 0.7;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 256;

    // Buffer size of 2048 gives ~128ms frames at 16kHz for lightning-fast voice detection
    this.processor = this.ctx.createScriptProcessor(2048, 1, 1);

    this.source.connect(this.filter);
    this.filter.connect(this.analyser);
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
        this.noiseFloor = this.noiseFloor * 0.94 + rms * 0.06;
      }

      // 3. Dynamic Threshold derived from user sensitivity:
      // norm: 0.0 = 0% (Full Noise - maximum suppression), 1.0 = 100% (No Noise - delicate quiet room)
      const norm = Math.max(0, Math.min(100, this.sensitivityLevel)) / 100;

      // Realistic conversational speech thresholds (produces clear pickup without requiring loud yelling):
      // at 0% (Full Noise): 0.035 RMS, at 50% (Balanced): 0.021 RMS, at 100% (Quiet Room): 0.008 RMS
      const baseOnsetRms = 0.035 - norm * 0.027;
      // Noise floor multiplier: 1.8x at 0% to 1.15x at 100%
      const noiseMultiplier = 1.8 - norm * 0.65;
      // Peak onset: 0.12 at 0% to 0.04 at 100%
      const basePeakOnset = 0.12 - norm * 0.08;

      // 4. Acoustic Echo Shield:
      // When AI is actively outputting speech through the speaker, suppress low acoustic bleed
      // but immediately allow natural user voice / barge-in.
      const isAiSpeaking = this.echoGuardEnabled && (this.isAiSpeakingCallback ? this.isAiSpeakingCallback() : false);
      if (isAiSpeaking) {
        // Suppress acoustic echo bleed (< 0.030 RMS). Normal user speech (>= 0.030 RMS or >= 0.14 peak) passes freely.
        const isUserSpeakingOverAi = rms >= 0.030 || peak >= 0.14;
        if (!isUserSpeakingOverAi) {
          this.consecutiveSpeechFrames = 0;
          this.isUserSpeaking = false;
          return;
        }
      }

      const speechOnsetThreshold = Math.max(baseOnsetRms, this.noiseFloor * noiseMultiplier);
      const speechPeakThreshold = Math.max(basePeakOnset, this.noiseFloor * 2.2);

      const speechSustainThreshold = speechOnsetThreshold * 0.55;
      const speechSustainPeak = speechPeakThreshold * 0.60;

      // Voice detection test for speech state tracking & visual feedback
      const isCurrentFrameVoice = rms >= speechSustainThreshold || peak >= speechSustainPeak;
      const base64Chunk = this.float32ToPcm16Base64(inputBuffer);

      if (isCurrentFrameVoice) {
        this.consecutiveSpeechFrames++;
        this.lastSpeechTime = now;

        if (!this.isUserSpeaking && this.consecutiveSpeechFrames >= 1) {
          this.isUserSpeaking = true;
          if (this.onSpeechStateChange) {
            this.onSpeechStateChange(true);
          }
        }
      } else {
        this.consecutiveSpeechFrames = 0;
        if (this.isUserSpeaking) {
          const silenceDuration = now - this.lastSpeechTime;
          if (silenceDuration >= this.silenceWaitMs) {
            this.isUserSpeaking = false;
            if (this.onSpeechStateChange) {
              this.onSpeechStateChange(false);
            }
            if (this.onTurnComplete) {
              this.onTurnComplete();
            }
          }
        }
      }

      // CRITICAL REAL-TIME STREAMING: Stream every live audio frame immediately to Gemini Live!
      // Zero pre-roll delay, zero burst buffering, zero dropped words.
      if (this.onDataCallback) {
        this.onDataCallback(base64Chunk);
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
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize) as any);
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
    if (this.filter) {
      try {
        this.filter.disconnect();
      } catch (e) {}
      this.filter = null;
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
