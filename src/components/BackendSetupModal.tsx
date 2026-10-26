import React, { useState } from 'react';
import { Server, ExternalLink, Check, Sparkles, X, AlertTriangle, ArrowRight } from 'lucide-react';
import { cleanBackendHost, saveBackendHost, getSavedBackendHost } from '../utils/backendConfig.ts';

interface BackendSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (host: string) => void;
  currentHost?: string;
}

export const BackendSetupModal: React.FC<BackendSetupModalProps> = ({
  isOpen,
  onClose,
  onSave,
  currentHost = '',
}) => {
  const [inputValue, setInputValue] = useState(currentHost || getSavedBackendHost() || '');
  const [hasSaved, setHasSaved] = useState(false);

  if (!isOpen) return null;

  const handleSave = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleaned = cleanBackendHost(inputValue);
    saveBackendHost(cleaned);
    onSave(cleaned);
    setHasSaved(true);
    setTimeout(() => {
      setHasSaved(false);
      onClose();
    }, 800);
  };

  const cleanedPreview = cleanBackendHost(inputValue);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900/95 p-6 shadow-2xl text-slate-200">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 text-white shadow-lg shadow-cyan-500/20">
            <Server className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white tracking-tight">Connect Backend Server</h3>
            <p className="text-xs text-slate-400">Render ব্যাকএন্ড লিঙ্ক কানেক্ট করুন</p>
          </div>
        </div>

        <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-3.5 mb-4 text-xs text-cyan-200 space-y-1.5">
          <div className="flex items-center gap-2 font-semibold text-cyan-300">
            <Sparkles className="h-4 w-4 text-cyan-400 shrink-0" />
            <span>কেন এই লিঙ্কটি প্রয়োজন?</span>
          </div>
          <p className="text-slate-300 leading-relaxed">
            Vercel সাধারণত স্ট্যাটিক ওয়েব ফাইল হোস্ট করে। কিন্তু রিয়েল-টাইম লাইভ ভয়েস (WebSocket) নিরবচ্ছিন্নভাবে চলার জন্য Node.js ব্যাকএন্ড সার্ভার প্রয়োজন, যা আপনি <strong>Render.com</strong>-এ ডিপ্লয় করেছেন।
          </p>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
              Render সার্ভিস URL দিন
            </label>
            <div className="relative">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="যেমন: https://ai-teacher-xxxx.onrender.com"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-xs text-cyan-300 font-mono placeholder-slate-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 focus:outline-none"
                autoFocus
              />
            </div>
            {cleanedPreview && (
              <p className="mt-1.5 text-[11px] text-emerald-400 font-mono flex items-center gap-1">
                <Check className="h-3 w-3" />
                কানেক্ট হবে: <span className="font-semibold">{cleanedPreview}</span>
              </p>
            )}
          </div>

          <div className="rounded-xl bg-slate-950/50 border border-slate-800/80 p-3 text-xs space-y-1.5 text-slate-400">
            <p className="font-semibold text-slate-300">কোথা থেকে URL পাবেন?</p>
            <ol className="list-decimal list-inside space-y-1 text-[11px]">
              <li>
                <a
                  href="https://dashboard.render.com"
                  target="_blank"
                  rel="noreferrer"
                  className="text-cyan-400 underline inline-flex items-center gap-1 hover:text-cyan-300"
                >
                  dashboard.render.com <ExternalLink className="h-3 w-3" />
                </a>-এ লগইন করুন।
              </li>
              <li>আপনার তৈরি করা <strong>Web Service</strong>-এ ক্লিক করুন।</li>
              <li>উপরে নামের নিচে দেওয়া <strong>onrender.com</strong> লিঙ্কটি কপি করে এখানে পেস্ট করুন।</li>
            </ol>
          </div>

          <div className="flex gap-2.5 pt-2">
            <button
              type="submit"
              disabled={!cleanedPreview}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-semibold text-xs text-white transition-all shadow-lg ${
                hasSaved
                  ? 'bg-emerald-600 shadow-emerald-500/20'
                  : cleanedPreview
                  ? 'bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 shadow-cyan-500/20'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              {hasSaved ? (
                <>
                  <Check className="h-4 w-4" />
                  সংরক্ষিত হয়েছে! কানেক্ট হচ্ছে...
                </>
              ) : (
                <>
                  <Server className="h-4 w-4" />
                  Save & Connect
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="py-2.5 px-4 rounded-xl border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 font-semibold text-xs transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
