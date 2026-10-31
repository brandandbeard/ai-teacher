import React, { useRef, useEffect, useState, useCallback } from 'react';
import { User, Bot, Wrench, Clock, Download, Trash2, Copy, Check, ChevronDown } from 'lucide-react';

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
  compact?: boolean;
}

export const TranscriptView: React.FC<TranscriptViewProps> = ({
  items,
  onClear,
  voiceName,
  compact = false,
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const prevItemsCountRef = useRef(items.length);

  const scrollToBottom = useCallback((smooth = true) => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto',
      });
      setIsUserScrolledUp(false);
      setUnreadCount(0);
    }
  }, []);

  // Monitor user scroll position (YouTube Live Chat style)
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    // If user has scrolled up more than 40px away from the bottom
    const userScrolledUp = distanceFromBottom > 40;
    setIsUserScrolledUp(userScrolledUp);
    if (!userScrolledUp) {
      setUnreadCount(0);
    }
  };

  // Auto-scroll when new items arrive if user is already at the bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const isNewMessage = items.length > prevItemsCountRef.current;
    prevItemsCountRef.current = items.length;

    if (!isUserScrolledUp) {
      // Smoothly push up like YouTube live chat
      el.scrollTo({
        top: el.scrollHeight,
        behavior: 'smooth',
      });
    } else if (isNewMessage) {
      // Increment unread count badge for user
      setUnreadCount((c) => c + 1);
    }
  }, [items, isUserScrolledUp]);

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
    <div className="relative flex flex-col h-full w-full max-h-full rounded-2xl border border-slate-800 bg-slate-900/80 backdrop-blur-md overflow-hidden shadow-2xl">
      {/* Header */}
      <div
        className={`flex items-center justify-between border-b border-slate-800/80 px-3 bg-slate-950/60 shrink-0 ${
          compact ? 'py-1.5' : 'py-2.5'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-2 w-2 rounded-full bg-cyan-400 animate-pulse shrink-0" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 truncate">
            Live Transcript
          </h3>
          <span className="text-[10px] text-slate-500 font-mono shrink-0">
            ({items.length})
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={copyTranscript}
            disabled={items.length === 0}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 transition-colors"
            title="Copy to clipboard"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={exportTranscript}
            disabled={items.length === 0}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 transition-colors"
            title="Export text transcript"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onClear}
            disabled={items.length === 0}
            className="p-1 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800 disabled:opacity-30 transition-colors"
            title="Clear transcript"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Messages Feed: YouTube Live Chat style (pushes upward, bottom-anchored, scroll-up to view old) */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-2.5 sm:p-3 font-sans text-xs scroll-smooth [scrollbar-width:thin] [scrollbar-color:#334155_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-700/80 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-slate-600"
      >
        {items.length === 0 ? (
          <div className="h-full min-h-[120px] flex flex-col items-center justify-center text-center p-4 text-slate-500">
            <Clock className="h-7 w-7 mb-1.5 opacity-30 text-cyan-400" />
            <p className="font-semibold text-slate-300 text-xs">কোনো বার্তা নেই (No dialogue yet)</p>
            <p className="text-[11px] text-slate-500 mt-1 max-w-xs leading-normal">
              কথা বলুন বা নিচের চ্যাটবক্সে লিখে পাঠালে লাইভ মেসেজগুলো এখানে ইউটিউব লাইভের মতো উপর দিকে উঠতে থাকবে।
            </p>
          </div>
        ) : (
          /* Bottom-anchored container: as new messages arrive at the bottom, earlier messages push upward */
          <div className="flex flex-col justify-end min-h-full space-y-2">
            {items.map((item) => {
              if (item.sender === 'tool' && item.toolDetails) {
                return (
                  <div
                    key={item.id}
                    className="rounded-xl border border-indigo-500/20 bg-indigo-950/20 p-2 space-y-1"
                  >
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-semibold text-indigo-400 flex items-center gap-1.5 truncate">
                        <Wrench className="h-3 w-3 shrink-0" />
                        Tool: {item.toolDetails.name}
                      </span>
                      <span className="text-[9px] text-slate-500 font-mono shrink-0">{item.timestamp}</span>
                    </div>
                    <div className="font-mono text-[10px] text-slate-400 bg-slate-950/60 p-1.5 rounded border border-slate-800 break-all">
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
                  <div key={item.id} className="text-center py-0.5">
                    <span className="inline-block px-2 py-0.5 rounded-full bg-slate-800/80 text-[10px] text-slate-400 border border-slate-700/50">
                      {item.text}
                    </span>
                  </div>
                );
              }

              const isUser = item.sender === 'user';

              return (
                <div
                  key={item.id}
                  className={`flex gap-2 transition-all ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  {!isUser && (
                    <div className="flex h-6 w-6 sm:h-7 sm:w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-tr from-cyan-500 to-indigo-600 text-white shadow">
                      <Bot className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] rounded-2xl p-2.5 sm:p-3 leading-relaxed shadow-sm ${
                      isUser
                        ? 'bg-cyan-600 text-white rounded-tr-sm shadow-cyan-600/10'
                        : 'bg-slate-800/90 text-slate-200 border border-slate-700/60 rounded-tl-sm'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2.5 mb-1 text-[10px] opacity-75">
                      <span className="font-bold truncate">
                        {isUser ? 'You' : `AI Mentor (${voiceName})`}
                      </span>
                      <span className="font-mono shrink-0">{item.timestamp}</span>
                    </div>
                    <p className="text-xs whitespace-pre-wrap break-words">{item.text}</p>
                    {item.isInterrupted && (
                      <span className="mt-1 inline-block text-[9px] font-mono text-amber-300 bg-amber-950/50 px-1.5 py-0.5 rounded border border-amber-500/30">
                        [Interrupted by user]
                      </span>
                    )}
                  </div>
                  {isUser && (
                    <div className="flex h-6 w-6 sm:h-7 sm:w-7 shrink-0 items-center justify-center rounded-lg bg-slate-700 text-slate-200 shadow">
                      <User className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating YouTube Live style "↓ নতুন মেসেজ" pill button when user scrolled up */}
      {isUserScrolledUp && (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cyan-600 hover:bg-cyan-500 active:scale-95 text-white text-xs font-semibold shadow-xl shadow-black/60 border border-cyan-400/50 backdrop-blur-md transition-all animate-bounce"
        >
          <ChevronDown className="h-3.5 w-3.5" />
          <span>নতুন বার্তা {unreadCount > 0 ? `(${unreadCount})` : ''}</span>
        </button>
      )}
    </div>
  );
};
