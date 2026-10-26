import React, { useRef, useEffect } from 'react';
import { User, Bot, Wrench, Clock, Download, Trash2, Copy, Check } from 'lucide-react';

export interface TranscriptItem {
  id: string;
  sender: 'user' | 'gemini' | 'tool' | 'system';
  text: string;
  timestamp: string;
  toolDetails?: {
    name: string;
    args: any;
    result: any;
  };
  isInterrupted?: boolean;
}

interface TranscriptViewProps {
  items: TranscriptItem[];
  onClear: () => void;
  voiceName: string;
}

export const TranscriptView: React.FC<TranscriptViewProps> = ({ items, onClear, voiceName }) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [copied, setCopied] = React.useState(false);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [items]);

  const exportTranscript = () => {
    const textContent = items
      .map((i) => `[${i.timestamp}] ${i.sender.toUpperCase()}: ${i.text}`)
      .join('\n\n');
    const blob = new Blob([textContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `live-voice-transcript-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyTranscript = () => {
    const textContent = items
      .map((i) => `[${i.timestamp}] ${i.sender.toUpperCase()}: ${i.text}`)
      .join('\n\n');
    navigator.clipboard.writeText(textContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 px-4 py-3 bg-slate-950/40">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Live Transcript</h3>
          <span className="text-[10px] text-slate-500 font-mono">({items.length} events)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={copyTranscript}
            disabled={items.length === 0}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-40 transition-colors"
            title="Copy to clipboard"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={exportTranscript}
            disabled={items.length === 0}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-40 transition-colors"
            title="Export text transcript"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onClear}
            disabled={items.length === 0}
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800 disabled:opacity-40 transition-colors"
            title="Clear transcript"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Messages Feed */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 font-sans text-xs">
        {items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
            <Clock className="h-8 w-8 mb-2 opacity-30 text-cyan-400" />
            <p className="font-medium text-slate-400">No dialogue yet</p>
            <p className="text-[11px] text-slate-600 mt-1 max-w-xs">
              Start the live conversation or type a message below to speak with your AI mentor in real-time.
            </p>
          </div>
        ) : (
          items.map((item) => {
            if (item.sender === 'tool' && item.toolDetails) {
              return (
                <div
                  key={item.id}
                  className="rounded-xl border border-indigo-500/20 bg-indigo-950/20 p-3 space-y-1.5"
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-indigo-400 flex items-center gap-1.5">
                      <Wrench className="h-3.5 w-3.5" />
                      Tool Invocation: {item.toolDetails.name}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">{item.timestamp}</span>
                  </div>
                  <div className="font-mono text-[10px] text-slate-400 bg-slate-950/60 p-2 rounded border border-slate-800">
                    <div>Args: {JSON.stringify(item.toolDetails.args)}</div>
                    <div className="text-emerald-400 mt-0.5">
                      Result: {JSON.stringify(item.toolDetails.result)}
                    </div>
                  </div>
                </div>
              );
            }

            if (item.sender === 'system') {
              return (
                <div key={item.id} className="text-center py-1">
                  <span className="inline-block px-2.5 py-0.5 rounded-full bg-slate-800/80 text-[10px] text-slate-400 border border-slate-700/50">
                    {item.text}
                  </span>
                </div>
              );
            }

            const isUser = item.sender === 'user';

            return (
              <div
                key={item.id}
                className={`flex gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {!isUser && (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-tr from-cyan-500 to-indigo-600 text-white shadow">
                    <Bot className="h-4 w-4" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-2xl p-3 leading-relaxed ${
                    isUser
                      ? 'bg-cyan-600 text-white rounded-tr-sm shadow-md shadow-cyan-600/10'
                      : 'bg-slate-800/90 text-slate-200 border border-slate-700/60 rounded-tl-sm'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 mb-1 text-[10px] opacity-75">
                    <span className="font-semibold">
                      {isUser ? 'You' : `AI Mentor (${voiceName})`}
                    </span>
                    <span className="font-mono">{item.timestamp}</span>
                  </div>
                  <p className="text-xs whitespace-pre-wrap">{item.text}</p>
                  {item.isInterrupted && (
                    <span className="mt-1.5 inline-block text-[10px] font-mono text-amber-300 bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-500/30">
                      [Interrupted by user]
                    </span>
                  )}
                </div>
                {isUser && (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-700 text-slate-200 shadow">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
