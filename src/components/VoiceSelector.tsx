import React, { useState } from 'react';
import { Play, Volume2, Check, Sparkles, Loader2, GraduationCap } from 'lucide-react';
import { ALL_PERSONA_PRESETS, PersonaPreset } from '../data/teacherPersonas.ts';

export interface VoiceOption {
  id: string;
  name: string;
  gender: string;
  tone: string;
  description: string;
  accentColor: string;
}

export const VOICES: VoiceOption[] = [
  {
    id: 'Kore',
    name: 'Kore (Kolkata Accent)',
    gender: 'Female / Kolkata Indian',
    tone: 'Indian English & Fluent Bangla',
    description: 'Natural Kolkata accent. Warm and fluent in both English and Bengali speech.',
    accentColor: 'from-pink-500 to-rose-600',
  },
  {
    id: 'Charon',
    name: 'Charon (Kolkata Accent)',
    gender: 'Male / Resonant Teacher',
    tone: 'Authentic Bengali Mentor',
    description: 'Deep, authoritative Kolkata teacher cadence for bilingual SSC & WBPSC coaching.',
    accentColor: 'from-purple-500 to-indigo-700',
  },
  {
    id: 'Puck',
    name: 'Puck',
    gender: 'Playful / Upbeat',
    tone: 'Spirited, engaging, curious',
    description: 'Bright and energetic, great for rapid-fire drills and dynamic banter.',
    accentColor: 'from-amber-500 to-orange-600',
  },
  {
    id: 'Zephyr',
    name: 'Zephyr',
    gender: 'Neutral / Gentle',
    tone: 'Smooth, balanced, modern',
    description: 'Crisp and articulate with friendly, conversational pacing.',
    accentColor: 'from-cyan-500 to-blue-600',
  },
  {
    id: 'Fenrir',
    name: 'Fenrir',
    gender: 'Strong / Confident',
    tone: 'Bold, commanding, direct',
    description: 'Focused and energetic with crisp articulation for science and analytical subjects.',
    accentColor: 'from-emerald-500 to-teal-700',
  },
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
      }
      setPlayingVoiceId(null);
      return;
    }

    try {
      setPlayingVoiceId(voiceId);
      const isExternalHost =
        typeof window !== 'undefined' &&
        (window.location.hostname.endsWith('github.io') ||
          window.location.hostname.endsWith('vercel.app') ||
          window.location.hostname.endsWith('netlify.app') ||
          (!window.location.hostname.includes('run.app') &&
            window.location.hostname !== 'localhost' &&
            window.location.hostname !== '127.0.0.1'));
      const baseUrl = isExternalHost ? 'https://ais-pre-rhyd6xypf3o733gk6gjlaz-761573247142.asia-northeast1.run.app' : '';

      const sampleText =
        voiceId === 'Kore' || voiceId === 'Charon'
          ? 'নমস্কার আরিফ! আমি কলকাতা অ্যাকসেন্টে বাংলা এবং ইংলিশ দুটোই ফ্লুয়েন্টলি বলতে পারি।'
          : `Hello! I am ${voiceId}, your Live Voice AI partner.`;

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

  const bengaliTeachers = ALL_PERSONA_PRESETS.filter((p) => p.category === 'bengali-teachers');
  const generalPersonas = ALL_PERSONA_PRESETS.filter((p) => p.category === 'general');

  return (
    <div className="space-y-5">
      <div>
        <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between mb-2.5">
          <span className="flex items-center gap-1.5">
            <Volume2 className="h-3.5 w-3.5 text-cyan-400" />
            Select Live Voice
          </span>
          <span className="text-[10px] font-normal text-emerald-400">
            Kore & Charon: Kolkata Bengali & Indian English
          </span>
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          {VOICES.map((v) => {
            const isSelected = selectedVoice === v.id;
            const isPlaying = playingVoiceId === v.id;

            return (
              <div
                key={v.id}
                onClick={() => !disabled && onSelectVoice(v.id)}
                className={`relative flex flex-col justify-between p-3 rounded-xl border transition-all cursor-pointer select-none ${
                  isSelected
                    ? 'border-cyan-500 bg-cyan-950/30 shadow-lg shadow-cyan-500/10'
                    : 'border-slate-800 bg-slate-900/50 hover:border-slate-700 hover:bg-slate-900'
                } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-white flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full bg-gradient-to-tr ${v.accentColor}`} />
                      {v.name}
                    </span>
                    {isSelected && <Check className="h-4 w-4 text-cyan-400" />}
                  </div>
                  <div className="text-[11px] text-cyan-400/90 font-medium mt-0.5">{v.tone}</div>
                  <p className="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-tight">
                    {v.description}
                  </p>
                </div>

                <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">{v.gender}</span>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={(e) => previewVoice(v.id, e)}
                    className="flex items-center gap-1 text-[11px] font-medium text-slate-300 hover:text-cyan-400 transition-colors px-2 py-0.5 rounded bg-slate-800/80 hover:bg-slate-800"
                    title={`Listen to sample of ${v.name}`}
                  >
                    {isPlaying ? (
                      <Loader2 className="h-3 w-3 animate-spin text-cyan-400" />
                    ) : (
                      <Play className="h-3 w-3 fill-current" />
                    )}
                    {isPlaying ? 'Playing' : 'Preview'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Persona Presets */}
      <div className="space-y-3">
        <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
          Persona & Conversation Style
        </label>

        {/* Bengali Teacher Personas */}
        <div>
          <div className="text-[11px] font-semibold text-amber-400 flex items-center gap-1.5 mb-2">
            <GraduationCap className="h-3.5 w-3.5" />
            <span>Dedicated Subject Mentors (History, Polity, Economy, Geo, Sci-Tech, GK, English)</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {bengaliTeachers.map((p) => {
              const isActive = systemInstruction.includes(p.title);
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

        {/* General AI Companions */}
        <div>
          <div className="text-[11px] font-semibold text-slate-400 mb-2">
            General AI Companions
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {generalPersonas.map((p) => {
              const isActive = systemInstruction.includes(p.title);
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleSelectPreset(p)}
                  className={`text-left p-2.5 rounded-lg border transition-all ${
                    isActive
                      ? 'border-cyan-500 bg-cyan-950/40'
                      : 'border-slate-800 bg-slate-900/40 hover:bg-slate-900 hover:border-slate-700'
                  }`}
                >
                  <div className="text-xs font-semibold text-slate-200">{p.title}</div>
                  <div className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">{p.desc}</div>
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
