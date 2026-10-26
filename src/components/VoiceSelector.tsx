import React, { useState } from 'react';
import { Play, Volume2, Check, Sparkles, Loader2, GraduationCap, BookOpen } from 'lucide-react';
import { ALL_PERSONA_PRESETS, PersonaPreset } from '../data/teacherPersonas.ts';
import { getHttpBaseUrl } from '../utils/backendConfig.ts';

export interface VoiceOption {
  id: string;
  name: string;
  accentColor: string;
}

export const VOICES: VoiceOption[] = [
  { id: 'Kore', name: 'Kore', accentColor: 'from-pink-500 to-rose-600' },
  { id: 'Charon', name: 'Charon', accentColor: 'from-purple-500 to-indigo-700' },
  { id: 'Puck', name: 'Puck', accentColor: 'from-amber-500 to-orange-600' },
  { id: 'Zephyr', name: 'Zephyr', accentColor: 'from-cyan-500 to-blue-600' },
  { id: 'Fenrir', name: 'Fenrir', accentColor: 'from-emerald-500 to-teal-700' },
];

export const PERSONA_PRESETS = ALL_PERSONA_PRESETS;

interface VoiceSelectorProps {
  selectedVoice: string;
  onSelectVoice: (voiceId: string) => void;
  systemInstruction: string;
  onChangeInstruction: (instruction: string) => void;
  disabled?: boolean;
}

export const VoiceSelector: React.FC<VoiceSelectorProps> = ({
  selectedVoice,
  onSelectVoice,
  systemInstruction,
  onChangeInstruction,
  disabled = false,
}) => {
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  const previewVoice = async (voiceId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (playingVoiceId === voiceId) {
      if (audioElement) {
        audioElement.pause();
        audioElement.currentTime = 0;
      }
      setPlayingVoiceId(null);
      return;
    }

    if (audioElement) {
      audioElement.pause();
      audioElement.currentTime = 0;
    }

    try {
      setPlayingVoiceId(voiceId);
      const baseUrl = getHttpBaseUrl();

      const sampleText =
        voiceId === 'Kore' || voiceId === 'Charon'
          ? 'নমস্কার! আমি মেগা কুইজ ভয়েস এআই।'
          : `Hello! I am ${voiceId}.`;

      const res = await fetch(`${baseUrl}/api/gemini/voice-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voice: voiceId,
          text: sampleText,
        }),
      });

      if (!res.ok) throw new Error('Preview failed');
      const data = await res.json();
      if (data.audioWavBase64) {
        const audio = new Audio(`data:audio/wav;base64,${data.audioWavBase64}`);
        setAudioElement(audio);
        audio.play();
        audio.onended = () => setPlayingVoiceId(null);
        audio.onerror = () => setPlayingVoiceId(null);
      } else {
        setPlayingVoiceId(null);
      }
    } catch (err) {
      console.error(err);
      setPlayingVoiceId(null);
    }
  };

  const handleSelectPreset = (p: PersonaPreset) => {
    onChangeInstruction(p.prompt);
    if (p.recommendedVoice) {
      onSelectVoice(p.recommendedVoice);
    }
  };

  const wbbseList = ALL_PERSONA_PRESETS.filter((p) => p.category === 'wbbse');
  const competitiveList = ALL_PERSONA_PRESETS.filter((p) => p.category === 'competitive-spoken');

  return (
    <div className="space-y-5">
      {/* Voice Selection (Clean, no spam, name + preview button only) */}
      <div>
        <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mb-2.5">
          <Volume2 className="h-3.5 w-3.5 text-cyan-400" />
          <span>Select Live Voice</span>
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {VOICES.map((v) => {
            const isSelected = selectedVoice === v.id;
            const isPlaying = playingVoiceId === v.id;

            return (
              <div
                key={v.id}
                onClick={() => !disabled && onSelectVoice(v.id)}
                className={`relative flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer select-none ${
                  isSelected
                    ? 'border-cyan-500 bg-cyan-950/40 shadow-lg shadow-cyan-500/10'
                    : 'border-slate-800 bg-slate-900/50 hover:border-slate-700 hover:bg-slate-900'
                } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full bg-gradient-to-tr ${v.accentColor}`} />
                  <span className="font-semibold text-sm text-white">{v.name}</span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={(e) => previewVoice(v.id, e)}
                    className="flex items-center gap-1 text-[11px] font-medium text-slate-300 hover:text-cyan-400 transition-colors px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700"
                    title={`Listen to sample of ${v.name}`}
                  >
                    {isPlaying ? (
                      <Loader2 className="h-3 w-3 animate-spin text-cyan-400" />
                    ) : (
                      <Play className="h-3 w-3 fill-current" />
                    )}
                    <span className="text-[10px]">{isPlaying ? 'Playing' : 'Preview'}</span>
                  </button>
                  {isSelected && <Check className="h-4 w-4 text-cyan-400 ml-1" />}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Persona & Conversation Style (WBBSE and Competitive & Spoken only, subjects only) */}
      <div className="space-y-4">
        <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
          Persona & Conversation Style
        </label>

        {/* 1. WBBSE Section */}
        <div className="rounded-2xl border border-emerald-500/40 bg-gradient-to-br from-emerald-950/40 via-slate-900/70 to-slate-950 p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
              <BookOpen className="h-4 w-4 text-emerald-400" />
              WBBSE
            </span>
            <span className="text-[10px] text-emerald-300 bg-emerald-950/90 border border-emerald-500/40 px-2 py-0.5 rounded-full font-medium">
              Class V - X
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {wbbseList.map((p) => {
              const isActive = systemInstruction.includes(p.prompt.slice(0, 50));
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleSelectPreset(p)}
                  className={`text-left p-3 rounded-xl border transition-all ${
                    isActive
                      ? 'border-emerald-400 bg-emerald-950/60 shadow-md shadow-emerald-500/20 ring-1 ring-emerald-400/50'
                      : 'border-slate-800 bg-slate-900/60 hover:bg-slate-900 hover:border-emerald-500/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">{p.title}</span>
                    <span className="text-[9px] text-emerald-300 bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-500/30 font-semibold">
                      {p.badge}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1 leading-snug">
                    {p.desc}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Competitive & Spoken Section */}
        <div className="rounded-2xl border border-amber-500/30 bg-slate-900/40 p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
              <GraduationCap className="h-4 w-4" />
              Competitive & Spoken
            </span>
            <span className="text-[10px] text-amber-400/90 bg-amber-950/70 border border-amber-500/30 px-2 py-0.5 rounded-full font-medium">
              Competitive & Spoken
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {competitiveList.map((p) => {
              const isActive = systemInstruction.includes(p.prompt.slice(0, 50));
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleSelectPreset(p)}
                  className={`text-left p-2.5 rounded-lg border transition-all ${
                    isActive
                      ? 'border-amber-500 bg-amber-950/40 shadow-sm shadow-amber-500/10'
                      : 'border-slate-800 bg-slate-900/40 hover:bg-slate-900 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-100">{p.title}</span>
                    <span className="text-[9px] text-amber-400/90 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-500/30">
                      {p.badge}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1 line-clamp-2 leading-tight">
                    {p.desc}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="relative mt-2">
          <textarea
            value={systemInstruction}
            onChange={(e) => onChangeInstruction(e.target.value)}
            disabled={disabled}
            rows={3}
            className="w-full rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-xs text-slate-200 placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 disabled:opacity-60 font-mono resize-none leading-relaxed"
            placeholder="Custom system instructions for Live Voice AI..."
          />
        </div>
      </div>
    </div>
  );
};
