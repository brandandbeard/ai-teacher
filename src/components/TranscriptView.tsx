import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  User,
  Bot,
  Wrench,
  Clock,
  Download,
  Trash2,
  Copy,
  Check,
  ChevronDown,
  FileSpreadsheet,
  FileText,
  Printer,
  X,
} from 'lucide-react';

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
  topicName?: string;
  compact?: boolean;
}

export const TranscriptView: React.FC<TranscriptViewProps> = ({
  items,
  onClear,
  voiceName,
  topicName = 'সাধারণ ক্লাস আলোচনা',
  compact = false,
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const prevItemsCountRef = useRef(items.length);

  // Export Study Data modal states
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportScope, setExportScope] = useState<'all' | 'ai_only'>('all');
  const [exportFormat, setExportFormat] = useState<'csv' | 'pdf' | 'txt'>('csv');
  const [downloadSuccess, setDownloadSuccess] = useState(false);

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
      el.scrollTo({
        top: el.scrollHeight,
        behavior: 'smooth',
      });
    } else if (isNewMessage) {
      setUnreadCount((c) => c + 1);
    }
  }, [items, isUserScrolledUp]);

  const copyTranscript = () => {
    const textContent = items
      .map((i) => `[${i.timestamp}] ${i.sender.toUpperCase()}: ${i.text}`)
      .join('\n\n');
    navigator.clipboard.writeText(textContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Execute export based on chosen scope and format
  const handleDownloadData = () => {
    const filteredItems = items.filter((item) => {
      if (exportScope === 'ai_only') {
        return item.sender === 'gemini';
      }
      return item.sender === 'gemini' || item.sender === 'user';
    });

    if (filteredItems.length === 0) {
      alert('ডাউনলোড করার মতো কোনো আলোচনা পাওয়া যায়নি!');
      return;
    }

    const cleanTopic = (topicName || 'study-session')
      .replace(/[^\w\u0980-\u09FF-]/g, '_')
      .slice(0, 40);
    const dateStr = new Date().toISOString().slice(0, 10);
    const timeStamp = Date.now();

    if (exportFormat === 'csv') {
      // 1. Excel / CSV Export (with UTF-8 BOM so Excel opens Bengali perfectly)
      const escapeCsv = (str: string) => `"${(str || '').replace(/"/g, '""')}"`;
      const csvHeader = ['ক্রমিক নং', 'সময়', 'বক্তা', 'আলোচনা ও উত্তর'].map(escapeCsv).join(',');
      const csvRows = filteredItems.map((item, idx) => {
        const speaker = item.sender === 'user' ? 'You (শিক্ষার্থী)' : `AI Teacher (${voiceName})`;
        return [idx + 1, item.timestamp, speaker, item.text].map((v) => escapeCsv(String(v))).join(',');
      });

      const csvContent = '\uFEFF' + [csvHeader, ...csvRows].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `MegaQuiz-Data-${cleanTopic}-${dateStr}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else if (exportFormat === 'pdf') {
      // 2. Printable Study Notes / PDF
      const title = `Mega Quiz Voice AI - স্টাডি শিট (${topicName})`;
      const itemsHtml = filteredItems
        .map((item, idx) => {
          const isUser = item.sender === 'user';
          const speakerName = isUser ? 'You (শিক্ষার্থী)' : `AI Teacher (${voiceName})`;
          return `
          <div class="note-card ${isUser ? 'note-user' : 'note-ai'}">
            <div class="note-header">
              <span class="note-speaker ${isUser ? 'speaker-user' : 'speaker-ai'}">#${idx + 1} ${speakerName}</span>
              <span class="note-time">${item.timestamp}</span>
            </div>
            <div class="note-text">${item.text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
          </div>
        `;
        })
        .join('');

      const printableDoc = `<!DOCTYPE html>
<html lang="bn">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    @page { size: A4; margin: 15mm; }
    body {
      font-family: 'Plus Jakarta Sans', system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #0f172a;
      line-height: 1.6;
      background: #ffffff;
      margin: 0;
      padding: 20px;
    }
    .header-bar {
      border-bottom: 2px solid #0284c7;
      padding-bottom: 12px;
      margin-bottom: 20px;
    }
    .app-title {
      font-size: 20px;
      font-weight: 800;
      color: #0369a1;
      margin: 0 0 4px 0;
    }
    .meta-row {
      font-size: 12px;
      color: #475569;
    }
    .meta-row strong { color: #0f172a; }
    .note-card {
      margin-bottom: 14px;
      padding: 12px 14px;
      border-radius: 8px;
      page-break-inside: avoid;
    }
    .note-ai {
      background: #f8fafc;
      border-left: 4px solid #0284c7;
      border: 1px solid #e2e8f0;
      border-left-width: 4px;
      border-left-color: #0284c7;
    }
    .note-user {
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      border-left-width: 4px;
      border-left-color: #64748b;
    }
    .note-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 6px;
      font-size: 11px;
    }
    .speaker-ai { color: #0284c7; font-weight: 700; font-size: 12px; }
    .speaker-user { color: #334155; font-weight: 700; font-size: 12px; }
    .note-time { color: #94a3b8; font-family: monospace; }
    .note-text {
      font-size: 13px;
      white-space: pre-wrap;
      word-break: break-word;
      color: #1e293b;
    }
    .footer {
      margin-top: 30px;
      padding-top: 10px;
      border-top: 1px solid #e2e8f0;
      text-align: center;
      font-size: 11px;
      color: #94a3b8;
    }
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header-bar">
    <h1 class="app-title">Mega Quiz Voice AI - স্টাডি ও রিভিশন শিট</h1>
    <div class="meta-row">
      <strong>বিষয় / বিষয়বস্তু:</strong> ${topicName || 'ক্লাস আলোচনা'} | 
      <strong>তারিখ:</strong> ${new Date().toLocaleDateString('bn-BD')} | 
      <strong>ফিল্টার:</strong> ${exportScope === 'ai_only' ? 'শুধুমাত্র AI এর বক্তব্য' : 'আমার ও AI এর সম্পূর্ণ আলোচনা'} | 
      <strong>মোট নোট:</strong> ${filteredItems.length} টি
    </div>
  </div>
  <div class="notes-list">
    ${itemsHtml}
  </div>
  <div class="footer">
    Mega Quiz Voice AI · By Arif Hussain · প্র্যাকটিস ও রিভিশন নোট
  </div>
</body>
</html>`;

      const blob = new Blob([printableDoc], { type: 'text/html;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `MegaQuiz-StudySheet-${cleanTopic}-${dateStr}.html`;
      a.click();

      // Open print window for immediate "Save as PDF" / Print
      try {
        const printWindow = window.open(url, '_blank');
        if (printWindow) {
          printWindow.onload = () => {
            printWindow.focus();
            setTimeout(() => printWindow.print(), 300);
          };
        }
      } catch (err) {
        // Popups might be blocked, the HTML file was already downloaded
      }
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } else {
      // 3. Formatted Text File (.txt)
      const textHeader = [
        '=====================================================================',
        'Mega Quiz Voice AI - Study Notes & Discussion Data',
        `Topic: ${topicName || 'General Discussion'}`,
        `Date: ${new Date().toLocaleString()}`,
        `AI Mentor Voice: ${voiceName}`,
        `Filter: ${exportScope === 'ai_only' ? 'Only AI Replies' : 'AI + User Replies'}`,
        `Total Entries: ${filteredItems.length}`,
        '=====================================================================\n\n',
      ].join('\n');

      const textBody = filteredItems
        .map((item, idx) => {
          const speaker = item.sender === 'user' ? 'YOU (শিক্ষার্থী)' : `AI TEACHER (${voiceName})`;
          return `[#${idx + 1}] [${item.timestamp}] ${speaker}:\n${item.text}\n`;
        })
        .join('\n');

      const blob = new Blob([textHeader + textBody], { type: 'text/plain;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `MegaQuiz-Notes-${cleanTopic}-${timeStamp}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }

    setDownloadSuccess(true);
    setTimeout(() => {
      setDownloadSuccess(false);
      setShowExportModal(false);
    }, 1500);
  };

  const aiCount = items.filter((i) => i.sender === 'gemini').length;
  const totalDialogues = items.filter((i) => i.sender === 'gemini' || i.sender === 'user').length;

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
          {/* Download Practice Data Button */}
          <button
            onClick={() => setShowExportModal(true)}
            disabled={items.length === 0}
            className="p-1 rounded-lg text-slate-400 hover:text-cyan-300 hover:bg-slate-800 disabled:opacity-30 transition-colors"
            title="স্টাডি নোট ও ডাটা ডাউনলোড (Excel / PDF)"
          >
            <Download className="h-3.5 w-3.5 text-cyan-400" />
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

      {/* Messages Feed */}
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

      {/* Modal: স্টাডি নোট ও ডাটা ডাউনলোড (Download Practice Data) */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl p-4 sm:p-5 shadow-2xl space-y-4">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-cyan-950/60 border border-cyan-500/30 text-cyan-400">
                  <FileSpreadsheet className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">স্টাডি নোট ও ডাটা ডাউনলোড</h3>
                  <p className="text-[11px] text-slate-400">পরে প্র্যাকটিস ও রিভিশন করার জন্য ডাটা ফাইল ডাউনলোড করুন</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Scope Selection: All replies vs Only AI replies */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                ১. কোন কোন আলোচনা ডাউনলোড করবেন?
              </label>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setExportScope('all')}
                  className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-start gap-3 ${
                    exportScope === 'all'
                      ? 'border-cyan-500 bg-cyan-950/40 text-white shadow-sm'
                      : 'border-slate-800 bg-slate-950/50 hover:bg-slate-800/60 text-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="scope"
                    checked={exportScope === 'all'}
                    onChange={() => setExportScope('all')}
                    className="mt-1 accent-cyan-500 cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-cyan-300">
                        আমার ও AI এর সম্পূর্ণ কথোপকথন (AI + My Replies)
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                        {totalDialogues} টি
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                      আপনার প্রশ্ন ও উত্তর এবং AI শিক্ষকের পূর্ণাঙ্গ ব্যাখ্যা একসাথে থাকবে।
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setExportScope('ai_only')}
                  className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-start gap-3 ${
                    exportScope === 'ai_only'
                      ? 'border-emerald-500 bg-emerald-950/40 text-white shadow-sm'
                      : 'border-slate-800 bg-slate-950/50 hover:bg-slate-800/60 text-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="scope"
                    checked={exportScope === 'ai_only'}
                    onChange={() => setExportScope('ai_only')}
                    className="mt-1 accent-emerald-500 cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-emerald-300">
                        শুধুমাত্র AI এর বক্তব্য ও উত্তর (Only AI Replies)
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                        {aiCount} টি
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                      রিভিশনের সুবিধার জন্য শুধুমাত্র AI শিক্ষকের আলোচনা ও পাঠগুলো থাকবে।
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* Format Selection: Excel / PDF / TXT */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                ২. ফাইলের ফরম্যাট নির্বাচন করুন:
              </label>
              <div className="grid grid-cols-3 gap-2">
                {/* Excel .csv */}
                <button
                  type="button"
                  onClick={() => setExportFormat('csv')}
                  className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-1.5 ${
                    exportFormat === 'csv'
                      ? 'border-emerald-500 bg-emerald-950/50 text-emerald-200 shadow-md ring-1 ring-emerald-500/50'
                      : 'border-slate-800 bg-slate-950/50 hover:bg-slate-800/60 text-slate-400'
                  }`}
                >
                  <FileSpreadsheet className="h-5 w-5 text-emerald-400" />
                  <span className="text-xs font-bold">Excel (.csv)</span>
                  <span className="text-[9px] text-slate-400">স্প্রেডশিট ডেটা</span>
                </button>

                {/* PDF */}
                <button
                  type="button"
                  onClick={() => setExportFormat('pdf')}
                  className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-1.5 ${
                    exportFormat === 'pdf'
                      ? 'border-cyan-500 bg-cyan-950/50 text-cyan-200 shadow-md ring-1 ring-cyan-500/50'
                      : 'border-slate-800 bg-slate-950/50 hover:bg-slate-800/60 text-slate-400'
                  }`}
                >
                  <Printer className="h-5 w-5 text-cyan-400" />
                  <span className="text-xs font-bold">PDF / Print</span>
                  <span className="text-[9px] text-slate-400">স্টাডি শিট</span>
                </button>

                {/* TXT */}
                <button
                  type="button"
                  onClick={() => setExportFormat('txt')}
                  className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-1.5 ${
                    exportFormat === 'txt'
                      ? 'border-indigo-500 bg-indigo-950/50 text-indigo-200 shadow-md ring-1 ring-indigo-500/50'
                      : 'border-slate-800 bg-slate-950/50 hover:bg-slate-800/60 text-slate-400'
                  }`}
                >
                  <FileText className="h-5 w-5 text-indigo-400" />
                  <span className="text-xs font-bold">Text (.txt)</span>
                  <span className="text-[9px] text-slate-400">নোটপ্যাড ফাইল</span>
                </button>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                বাতিল (Cancel)
              </button>
              <button
                type="button"
                onClick={handleDownloadData}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 shadow-lg shadow-cyan-600/25 active:scale-95 transition-all flex items-center gap-1.5"
              >
                {downloadSuccess ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    <span>ডাউনলোড সম্পন্ন!</span>
                  </>
                ) : (
                  <>
                    <Download className="h-3.5 w-3.5" />
                    <span>
                      {exportFormat === 'csv'
                        ? 'Excel ফাইল ডাউনলোড'
                        : exportFormat === 'pdf'
                        ? 'PDF স্টাডি শিট তৈরি'
                        : 'টেক্সট ডাউনলোড'}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
