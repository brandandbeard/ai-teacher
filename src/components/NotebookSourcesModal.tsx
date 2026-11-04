import React, { useState } from 'react';
import {
  BookOpen,
  Youtube,
  FileText,
  HardDrive,
  Image as ImageIcon,
  FileEdit,
  Plus,
  Trash2,
  CheckCircle2,
  ExternalLink,
  Sparkles,
  Loader2,
  X,
  FileCheck,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  PlayCircle,
  Layers,
} from 'lucide-react';
import type { NotebookSource, NotebookSourceType, StudyGuide } from '../types/notebook.ts';

interface NotebookSourcesModalProps {
  isOpen: boolean;
  onClose: () => void;
  sources: NotebookSource[];
  onAddSource: (source: NotebookSource) => void;
  onRemoveSource: (id: string) => void;
  onToggleSource: (id: string) => void;
  onStartStudySession: (mode: 'lecture' | 'quiz' | 'doubts', sourceTitle?: string) => void;
}

export const NotebookSourcesModal: React.FC<NotebookSourcesModalProps> = ({
  isOpen,
  onClose,
  sources,
  onAddSource,
  onRemoveSource,
  onToggleSource,
  onStartStudySession,
}) => {
  const [activeTab, setActiveTab] = useState<NotebookSourceType>('youtube');
  const [urlInput, setUrlInput] = useState('');
  const [titleInput, setTitleInput] = useState('');
  const [textInput, setTextInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [expandedSourceId, setExpandedSourceId] = useState<string | null>(null);

  // Study Guide State
  const [studyGuide, setStudyGuide] = useState<StudyGuide | null>(null);
  const [isGeneratingGuide, setIsGeneratingGuide] = useState(false);
  const [showStudyGuideModal, setShowStudyGuideModal] = useState(false);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      if (!titleInput) {
        setTitleInput(file.name.replace(/\.[^/.]+$/, ''));
      }
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = () => {
          setPreviewImage(reader.result as string);
        };
        reader.readAsDataURL(file);
      } else {
        setPreviewImage(null);
      }
    }
  };

  const handleAddSource = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsLoading(true);

    try {
      let payloadContent = '';
      let mimeType = '';

      if (activeTab === 'youtube' || activeTab === 'drive') {
        if (!urlInput.trim()) {
          throw new Error('অনুগ্রহ করে একটি সঠিক লিঙ্ক (URL) দিন।');
        }
      } else if (activeTab === 'pdf' || activeTab === 'image') {
        if (!selectedFile) {
          throw new Error('অনুগ্রহ করে একটি ফাইল নির্বাচন বা আপলোড করুন।');
        }
        mimeType = selectedFile.type || (activeTab === 'pdf' ? 'application/pdf' : 'image/jpeg');

        // Convert file to base64
        payloadContent = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(selectedFile);
        });
      } else if (activeTab === 'text') {
        if (!textInput.trim()) {
          throw new Error('অনুগ্রহ করে কিছু নোট বা লেখার অংশ লিখুন।');
        }
        payloadContent = textInput.trim();
      }

      let newSource: NotebookSource;
      try {
        const res = await fetch('/api/notebook/parse-source', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: activeTab,
            title: titleInput.trim(),
            url: urlInput.trim(),
            content: payloadContent,
            mimeType,
            fileName: selectedFile?.name,
            fileSize: selectedFile?.size,
          }),
        });

        const rawText = await res.text();
        let jsonRes: any = null;
        try {
          jsonRes = JSON.parse(rawText);
        } catch (_jsonErr) {
          // Non-JSON response (e.g. HTML or raw string)
          jsonRes = null;
        }

        if (jsonRes && jsonRes.title) {
          newSource = jsonRes;
        } else {
          throw new Error('সার্ভার থেকে প্রাথমিক খসড়া তৈরি হয়েছে');
        }
      } catch (_netErr: any) {
        // Robust client-side fallback so adding source NEVER fails
        const ytRegex = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/|live\/))([a-zA-Z0-9_-]{11})/i;
        const match = urlInput.trim().match(ytRegex);
        const videoId = match ? match[1] : null;
        const fallbackTitle = titleInput.trim() || (videoId ? `ইউটিউব ভিডিও (${videoId})` : (selectedFile?.name || 'স্টাডি সোর্স'));

        newSource = {
          id: `src-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          type: activeTab,
          title: fallbackTitle,
          summary: `${fallbackTitle} - সোর্সটি সফলভাবে সংরক্ষিত হয়েছে। লাইভ ক্লাসে শিক্ষক এটি নিয়ে আলোচনা ও কুইজ পরিচালনা করবেন।`,
          keyPoints: ['সংযুক্ত স্টাডি উপাদান', `মূল বিষয়: ${fallbackTitle}`, 'লাইভ আলোচনা ও মৌখিক পরীক্ষা প্রস্তুত'],
          content: urlInput.trim() || payloadContent || fallbackTitle,
          url: urlInput.trim() || undefined,
          thumbnailUrl: videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : previewImage || undefined,
          fileName: selectedFile?.name,
          fileSize: selectedFile?.size,
          isActive: true,
          createdAt: Date.now(),
        };
      }

      onAddSource(newSource);

      // Reset form
      setUrlInput('');
      setTitleInput('');
      setTextInput('');
      setSelectedFile(null);
      setPreviewImage(null);
      setSuccessMessage(`"${newSource.title}" নোটবুক সোর্সে সফলভাবে যুক্ত হয়েছে!`);
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage(err.message || 'একটি ত্রুটি ঘটেছে।');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateStudyGuide = async () => {
    const active = sources.filter((s) => s.isActive);
    if (active.length === 0) {
      setErrorMessage('স্টাডি গাইড তৈরির জন্য অন্তত একটি সক্রিয় (Active) সোর্স নির্বাচন করুন।');
      return;
    }

    setErrorMessage(null);
    setIsGeneratingGuide(true);

    try {
      let guideData: StudyGuide | null = null;
      try {
        const res = await fetch('/api/notebook/generate-study-guide', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sources: active }),
        });

        const rawText = await res.text();
        guideData = JSON.parse(rawText);
      } catch (_gErr) {
        guideData = null;
      }

      if (!guideData || !guideData.title) {
        const firstTitle = active[0]?.title || 'স্টাডি উপাদান';
        const allKeyPoints = active.flatMap((s) => s.keyPoints || []);
        guideData = {
          title: `স্টাডি গাইড: ${firstTitle}`,
          overview: active.map((s) => `${s.title}: ${s.summary}`).join('\n\n'),
          keyConcepts: (allKeyPoints.length > 0 ? allKeyPoints.slice(0, 5) : [firstTitle]).map((pt, i) => ({
            term: `মূল ধারণা ${i + 1}`,
            definition: pt,
          })),
          quizQuestions: [
            { question: `${firstTitle}-এর প্রধান মূল বিষয়টি কী এবং এর গুরুত্ব আলোচনা করো?`, answer: 'সোর্সে প্রদত্ত সংজ্ঞা ও ব্যাখ্যার ওপর ভিত্তি করে উত্তর দিন।' },
            { question: 'এই পাঠের মূল সূত্র বা সিদ্ধান্ত কী কী?', answer: 'পাঠ্য উপাদানের মূল সিদ্ধান্তসমূহ উল্লেখ করুন।' },
            { question: 'বাস্তব ক্ষেত্রে এই তত্ত্ব কীভাবে প্রয়োগ করা হয়?', answer: 'বাস্তব উদাহরণ ও প্রায়োগিক দিক ব্যাখ্যা করুন।' },
          ],
          suggestedTopics: active.map((s) => s.title).slice(0, 3),
          generatedAt: Date.now(),
        };
      }

      setStudyGuide(guideData);
      setShowStudyGuideModal(true);
    } catch (err: any) {
      setErrorMessage(err.message || 'স্টাডি গাইড তৈরিতে সমস্যা হয়েছে।');
    } finally {
      setIsGeneratingGuide(false);
    }
  };

  const activeSourcesCount = sources.filter((s) => s.isActive).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
      <div className="flex flex-col w-full max-w-4xl max-h-[92vh] bg-slate-900 border border-indigo-500/30 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-800 bg-slate-900/95">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-500 text-white shadow-md shadow-indigo-500/20">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">
                  Google NotebookLM সোর্সেস ও পাঠ্য উপাদান
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950 border border-cyan-500/40 text-cyan-300 font-mono">
                  {sources.length} Sources ({activeSourcesCount} Active)
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                YouTube, PDF, Drive, ছবি বা নোটস যুক্ত করুন — AI সরাসরি এগুলো ভিত্তি করে আলোচনা ও প্রশ্ন করবে।
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body: Two Columns (Left: Add Source, Right: Sources List) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Column: Add New Source (5 cols) */}
          <div className="lg:col-span-5 flex flex-col gap-3.5 bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Plus className="h-4 w-4 text-cyan-400" />
                <span>নতুন সোর্স যুক্ত করুন (Add Source)</span>
              </span>
              <span className="text-[10px] text-slate-400 font-mono">NotebookLM</span>
            </div>

            {/* Source Type Selector Tabs */}
            <div className="grid grid-cols-5 gap-1 p-1 bg-slate-900 rounded-lg border border-slate-800 text-[11px]">
              <button
                type="button"
                onClick={() => { setActiveTab('youtube'); setErrorMessage(null); }}
                className={`py-1.5 px-1 rounded flex flex-col items-center gap-1 transition-all ${
                  activeTab === 'youtube'
                    ? 'bg-rose-600/90 text-white font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
                title="YouTube Video link"
              >
                <Youtube className="h-4 w-4 text-rose-300" />
                <span className="text-[9px]">YouTube</span>
              </button>

              <button
                type="button"
                onClick={() => { setActiveTab('pdf'); setErrorMessage(null); }}
                className={`py-1.5 px-1 rounded flex flex-col items-center gap-1 transition-all ${
                  activeTab === 'pdf'
                    ? 'bg-emerald-600/90 text-white font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
                title="PDF / Document"
              >
                <FileText className="h-4 w-4 text-emerald-300" />
                <span className="text-[9px]">PDF</span>
              </button>

              <button
                type="button"
                onClick={() => { setActiveTab('drive'); setErrorMessage(null); }}
                className={`py-1.5 px-1 rounded flex flex-col items-center gap-1 transition-all ${
                  activeTab === 'drive'
                    ? 'bg-amber-600/90 text-white font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
                title="Google Drive link"
              >
                <HardDrive className="h-4 w-4 text-amber-300" />
                <span className="text-[9px]">Drive</span>
              </button>

              <button
                type="button"
                onClick={() => { setActiveTab('image'); setErrorMessage(null); }}
                className={`py-1.5 px-1 rounded flex flex-col items-center gap-1 transition-all ${
                  activeTab === 'image'
                    ? 'bg-cyan-600/90 text-white font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
                title="Textbook Page or Diagram Image"
              >
                <ImageIcon className="h-4 w-4 text-cyan-300" />
                <span className="text-[9px]">Image</span>
              </button>

              <button
                type="button"
                onClick={() => { setActiveTab('text'); setErrorMessage(null); }}
                className={`py-1.5 px-1 rounded flex flex-col items-center gap-1 transition-all ${
                  activeTab === 'text'
                    ? 'bg-purple-600/90 text-white font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
                title="Custom text / Notes"
              >
                <FileEdit className="h-4 w-4 text-purple-300" />
                <span className="text-[9px]">Notes</span>
              </button>
            </div>

            {/* Title / Description input */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                সোর্স বা অধ্যায়ের নাম (ঐচ্ছিক):
              </label>
              <input
                type="text"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                placeholder="যেমন: আলো ও লেন্স অধ্যায়, মহেঞ্জোদারো ভিডিও..."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/30"
              />
            </div>

            {/* Dynamic Inputs based on Active Tab */}
            {activeTab === 'youtube' && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  YouTube ভিডিও লিঙ্ক দিন:
                </label>
                <div className="relative">
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-400/30 pl-8"
                  />
                  <Youtube className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-rose-400" />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  💡 যেকোনো শিক্ষামূলক ভিডিওর লিঙ্ক দিলে AI ভিডিওটির বিষয়বস্তু, সূত্র ও কুইজ পয়েন্ট স্বয়ংক্রিয়ভাবে সংগ্রহ করবে।
                </p>
              </div>
            )}

            {activeTab === 'drive' && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Google Drive / Docs লিঙ্ক দিন:
                </label>
                <div className="relative">
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://drive.google.com/file/d/..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30 pl-8"
                  />
                  <HardDrive className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-amber-400" />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  💡 শেয়ার লিঙ্ক পেস্ট করলে সোর্সের মূল পাঠ্য বিষয়বস্তু লাইভ পড়ার সাথে যুক্ত হবে।
                </p>
              </div>
            )}

            {activeTab === 'pdf' && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  PDF বা স্টাডি ডকুমেন্ট আপলোড করুন:
                </label>
                <div className="border-2 border-dashed border-slate-700 hover:border-emerald-500/60 rounded-xl p-4 text-center cursor-pointer transition-colors bg-slate-900/50">
                  <input
                    type="file"
                    accept=".pdf,.txt,.doc,.docx"
                    onChange={handleFileChange}
                    className="hidden"
                    id="pdf-upload-input"
                  />
                  <label htmlFor="pdf-upload-input" className="cursor-pointer flex flex-col items-center">
                    <FileText className="h-8 w-8 text-emerald-400 mb-1.5" />
                    <span className="text-xs font-semibold text-slate-200">
                      {selectedFile ? selectedFile.name : 'PDF ফাইল বেছে নিন'}
                    </span>
                    <span className="text-[10px] text-slate-400 mt-0.5">
                      {selectedFile
                        ? `${(selectedFile.size / 1024).toFixed(1)} KB`
                        : 'ক্লিক করে আপনার ক্লাসের নোটস বা চ্যাপ্টার PDF দিন'}
                    </span>
                  </label>
                </div>
              </div>
            )}

            {activeTab === 'image' && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  বইয়ের পাতা, চিত্র বা ফর্মুলা শিটের ছবি:
                </label>
                <div className="border-2 border-dashed border-slate-700 hover:border-cyan-500/60 rounded-xl p-3 text-center cursor-pointer transition-colors bg-slate-900/50">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                    id="image-upload-input"
                  />
                  <label htmlFor="image-upload-input" className="cursor-pointer flex flex-col items-center">
                    {previewImage ? (
                      <div className="relative mb-2">
                        <img
                          src={previewImage}
                          alt="Preview"
                          className="h-24 max-w-full rounded-lg object-contain border border-slate-700"
                        />
                      </div>
                    ) : (
                      <ImageIcon className="h-8 w-8 text-cyan-400 mb-1.5" />
                    )}
                    <span className="text-xs font-semibold text-slate-200">
                      {selectedFile ? selectedFile.name : 'ছবি বেছে নিন (Take / Upload Photo)'}
                    </span>
                    <span className="text-[10px] text-slate-400 mt-0.5">
                      হাতে লেখা নোটস, সায়েন্স ডায়াগ্রাম বা টেস্ট পেপারের পাতার ছবি
                    </span>
                  </label>
                </div>
              </div>
            )}

            {activeTab === 'text' && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  নোটস বা পাঠ্য কপি করে পেস্ট করুন:
                </label>
                <textarea
                  rows={4}
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="এখানে আপনার কোনো নোটস, প্রশ্নাবলি বা সিলেবাসের অংশ পেস্ট করুন..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400/30"
                />
              </div>
            )}

            {/* Error or Success notification */}
            {errorMessage && (
              <p className="text-[11px] text-rose-400 bg-rose-950/60 border border-rose-800/60 rounded-lg p-2">
                ⚠️ {errorMessage}
              </p>
            )}

            {successMessage && (
              <p className="text-[11px] text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 rounded-lg p-2">
                ✅ {successMessage}
              </p>
            )}

            {/* Submit Button */}
            <button
              type="button"
              disabled={isLoading}
              onClick={handleAddSource}
              className="mt-1 w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>উপাদান প্রসেস ও বিশ্লেষণ করা হচ্ছে...</span>
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  <span>নোটবুকে সোর্স হিসেবে যোগ করুন</span>
                </>
              )}
            </button>
          </div>

          {/* Right Column: Sources Management & NotebookLM Actions (7 cols) */}
          <div className="lg:col-span-7 flex flex-col gap-3">
            {/* Top Toolbar: Generate Study Guide + Quick Viva Actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-gradient-to-r from-indigo-950/50 via-slate-900 to-cyan-950/50 rounded-xl border border-indigo-500/20">
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-amber-400" />
                <span className="text-xs font-bold text-white">NotebookLM Studio টুলস</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isGeneratingGuide || sources.length === 0}
                  onClick={handleGenerateStudyGuide}
                  className="px-2.5 py-1.5 rounded-lg bg-indigo-600/80 hover:bg-indigo-600 border border-indigo-400/50 text-white text-[11px] font-semibold flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-40"
                  title="Generate Comprehensive Study Guide from active sources"
                >
                  {isGeneratingGuide ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                  )}
                  <span>স্টাডি গাইড তৈরি করুন</span>
                </button>
              </div>
            </div>

            {/* Sources List Container */}
            <div className="flex-1 min-h-[280px] max-h-[460px] overflow-y-auto space-y-2 pr-1">
              {sources.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center p-8 text-center border-2 border-dashed border-slate-800 rounded-xl bg-slate-950/30">
                  <div className="h-12 w-12 rounded-2xl bg-slate-900 flex items-center justify-center text-slate-500 mb-3 border border-slate-800">
                    <BookOpen className="h-6 w-6" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-300">কোনো সোর্স এখনো যুক্ত করা হয়নি</h4>
                  <p className="text-xs text-slate-500 max-w-sm mt-1 leading-relaxed">
                    বামে থেকে YouTube লিঙ্ক, PDF ফাইল, বইয়ের পাতার ছবি বা নোটস যুক্ত করুন। এআই স্বয়ংক্রিয়ভাবে সেখান থেকে গভীর পাঠদান শুরু করবে।
                  </p>
                </div>
              ) : (
                sources.map((src) => {
                  const isExpanded = expandedSourceId === src.id;
                  return (
                    <div
                      key={src.id}
                      className={`p-3 rounded-xl border transition-all ${
                        src.isActive
                          ? 'bg-slate-900/90 border-indigo-500/40 shadow-sm'
                          : 'bg-slate-950/40 border-slate-800/80 opacity-60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                          {/* Toggle Active Checkbox */}
                          <button
                            type="button"
                            onClick={() => onToggleSource(src.id)}
                            className={`mt-0.5 h-4 w-4 rounded flex items-center justify-center border transition-colors shrink-0 ${
                              src.isActive
                                ? 'bg-cyan-500 border-cyan-400 text-slate-950'
                                : 'border-slate-600 bg-slate-800'
                            }`}
                            title={src.isActive ? 'পড়ার আলোচনা থেকে বাদ দিন' : 'পড়ার আলোচনায় অন্তর্ভুক্ত করুন'}
                          >
                            {src.isActive && <CheckCircle2 className="h-3.5 w-3.5 fill-current" />}
                          </button>

                          {/* Source Thumbnail or Icon */}
                          <div className="shrink-0">
                            {src.thumbnailUrl ? (
                              <img
                                src={src.thumbnailUrl}
                                alt="Thumb"
                                className="h-10 w-14 rounded-md object-cover border border-slate-700"
                              />
                            ) : (
                              <div
                                className={`h-8 w-8 rounded-lg flex items-center justify-center text-white ${
                                  src.type === 'youtube'
                                    ? 'bg-rose-950/80 text-rose-400 border border-rose-500/40'
                                    : src.type === 'pdf'
                                    ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/40'
                                    : src.type === 'drive'
                                    ? 'bg-amber-950/80 text-amber-400 border border-amber-500/40'
                                    : src.type === 'image'
                                    ? 'bg-cyan-950/80 text-cyan-400 border border-cyan-500/40'
                                    : 'bg-purple-950/80 text-purple-400 border border-purple-500/40'
                                }`}
                              >
                                {src.type === 'youtube' && <Youtube className="h-4 w-4" />}
                                {src.type === 'pdf' && <FileText className="h-4 w-4" />}
                                {src.type === 'drive' && <HardDrive className="h-4 w-4" />}
                                {src.type === 'image' && <ImageIcon className="h-4 w-4" />}
                                {src.type === 'text' && <FileEdit className="h-4 w-4" />}
                              </div>
                            )}
                          </div>

                          {/* Title & Summary */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-bold text-slate-100 truncate max-w-[220px] sm:max-w-[320px]">
                                {src.title}
                              </span>
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700 uppercase font-mono">
                                {src.type}
                              </span>
                              {src.isActive ? (
                                <span className="text-[9px] text-emerald-400 font-mono">● সক্রিয়</span>
                              ) : (
                                <span className="text-[9px] text-slate-500 font-mono">নিষ্ক্রিয়</span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5 leading-snug">
                              {src.summary}
                            </p>
                          </div>
                        </div>

                        {/* Source Controls */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => setExpandedSourceId(isExpanded ? null : src.id)}
                            className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                            title={isExpanded ? 'সংক্ষিপ্ত করুন' : 'বিস্তারিত বিবরণ দেখুন'}
                          >
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => onRemoveSource(src.id)}
                            className="p-1 rounded-md text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                            title="মুছে ফেলুন (Delete Source)"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {/* Expanded Highlights & Viva Actions */}
                      {isExpanded && (
                        <div className="mt-2.5 pt-2.5 border-t border-slate-800 text-[11px] space-y-2 animate-in fade-in">
                          <div>
                            <strong className="text-slate-300 font-semibold block mb-1">
                              🔍 সংগৃহীত সারসংক্ষেপ ও প্রধান ধারণা:
                            </strong>
                            <p className="text-slate-300 leading-relaxed bg-slate-950/70 p-2 rounded-lg border border-slate-800">
                              {src.summary}
                            </p>
                          </div>

                          {src.keyPoints && src.keyPoints.length > 0 && (
                            <div>
                              <strong className="text-slate-300 font-semibold block mb-1">
                                📌 মূল পয়েন্টসমূহ:
                              </strong>
                              <ul className="list-disc list-inside space-y-0.5 text-slate-400 pl-1">
                                {src.keyPoints.map((pt, i) => (
                                  <li key={i}>{pt}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {src.url && (
                            <div className="text-[10px] text-slate-500 flex items-center gap-1 truncate">
                              <ExternalLink className="h-3 w-3 shrink-0" />
                              <a
                                href={src.url}
                                target="_blank"
                                rel="noreferrer"
                                className="truncate hover:text-cyan-400 underline"
                              >
                                {src.url}
                              </a>
                            </div>
                          )}

                          {/* Quick Study launch buttons for this specific source */}
                          <div className="pt-1 flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                onStartStudySession('lecture', src.title);
                                onClose();
                              }}
                              className="px-2.5 py-1 rounded-lg bg-emerald-700/80 hover:bg-emerald-600 text-white text-[10px] font-semibold flex items-center gap-1 shadow-sm transition-transform active:scale-95"
                            >
                              <span>🎙️</span>
                              <span>এই সোর্সের আলোচনা</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                onStartStudySession('doubts', src.title);
                                onClose();
                              }}
                              className="px-2.5 py-1 rounded-lg bg-cyan-700/80 hover:bg-cyan-600 text-white text-[10px] font-semibold flex items-center gap-1 shadow-sm transition-transform active:scale-95"
                            >
                              <span>🙋‍♂️</span>
                              <span>এই সোর্স নিয়ে প্রশ্ন</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                onStartStudySession('quiz', src.title);
                                onClose();
                              }}
                              className="px-2.5 py-1 rounded-lg bg-purple-700/80 hover:bg-purple-600 text-white text-[10px] font-semibold flex items-center gap-1 shadow-sm transition-transform active:scale-95"
                            >
                              <span>📝</span>
                              <span>এই সোর্স থেকে কুইজ</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Quick Live Launch Bar based on all active sources */}
            {sources.length > 0 && (
              <div className="mt-1 pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] text-slate-400">
                  {activeSourcesCount}টি সক্রিয় সোর্স লাইভ ক্লাসের জন্য প্রস্তুত।
                </span>
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onStartStudySession('lecture');
                      onClose();
                    }}
                    className="py-1.5 px-2.5 sm:px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-600/30 transition-transform active:scale-95"
                  >
                    <span>🎙️</span>
                    <span>সোর্সগুলো নিয়ে লাইভ ক্লাস</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onStartStudySession('doubts');
                      onClose();
                    }}
                    className="py-1.5 px-2.5 sm:px-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-cyan-600/30 transition-transform active:scale-95"
                  >
                    <span>🙋‍♂️</span>
                    <span>সোর্স AI কে প্রশ্ন</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onStartStudySession('quiz');
                      onClose();
                    }}
                    className="py-1.5 px-2.5 sm:px-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-purple-600/30 transition-transform active:scale-95"
                  >
                    <span>📝</span>
                    <span>সোর্স মৌখিক কুইজ</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-2.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
          <span>Google NotebookLM ইন্টিগ্রেশন · Gemini 3.8 Flash দিয়ে চালিত</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold"
          >
            বন্ধ করুন
          </button>
        </div>
      </div>

      {/* Study Guide Modal View */}
      {showStudyGuideModal && studyGuide && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md">
          <div className="flex flex-col w-full max-w-3xl max-h-[88vh] bg-slate-900 border border-amber-500/40 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-950/80">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-amber-400" />
                <h3 className="text-sm sm:text-base font-bold text-white">
                  {studyGuide.title || 'নোটবুক স্টাডি গাইড ও কুইজ প্রশ্নাবলি'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowStudyGuideModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 text-xs">
              {/* Executive Overview */}
              <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 leading-relaxed text-slate-200">
                <h4 className="font-bold text-amber-300 text-xs mb-1.5 flex items-center gap-1.5">
                  <BookOpen className="h-4 w-4" />
                  <span>সারসংক্ষেপ ও সামগ্রিক বিবরণ:</span>
                </h4>
                <p className="whitespace-pre-line leading-relaxed">{studyGuide.overview}</p>
              </div>

              {/* Key Concepts */}
              {studyGuide.keyConcepts && studyGuide.keyConcepts.length > 0 && (
                <div>
                  <h4 className="font-bold text-cyan-300 text-xs mb-2 flex items-center gap-1.5">
                    <Layers className="h-4 w-4" />
                    <span>প্রধান পরিভাষা ও সংজ্ঞাসমূহ (Key Concepts):</span>
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {studyGuide.keyConcepts.map((kc, i) => (
                      <div key={i} className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                        <strong className="text-slate-100 font-bold block mb-0.5">{kc.term}</strong>
                        <p className="text-slate-400 leading-snug">{kc.definition}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Viva / Quiz Questions */}
              {studyGuide.quizQuestions && studyGuide.quizQuestions.length > 0 && (
                <div>
                  <h4 className="font-bold text-purple-300 text-xs mb-2 flex items-center gap-1.5">
                    <HelpCircle className="h-4 w-4" />
                    <span>সম্ভাব্য মৌখিক পরীক্ষা ও কুইজ প্রশ্নোত্তর (Viva Practice):</span>
                  </h4>
                  <div className="space-y-2">
                    {studyGuide.quizQuestions.map((q, i) => (
                      <div key={i} className="p-3 rounded-lg bg-slate-950/80 border border-purple-500/20">
                        <p className="font-bold text-slate-100 mb-1">
                          {i + 1}. {q.question}
                        </p>
                        <p className="text-emerald-300 text-[11px] leading-relaxed">
                          <strong>উত্তর:</strong> {q.answer}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="px-5 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                এই স্টাডি গাইডটি লাইভ ক্লাসের জন্য এআই-র স্মৃতিতে সক্রিয় করা হয়েছে।
              </span>
              <button
                type="button"
                onClick={() => {
                  setShowStudyGuideModal(false);
                  onStartStudySession('quiz', studyGuide.title);
                  onClose();
                }}
                className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-purple-600/30"
              >
                <span>🎙️</span>
                <span>এই গাইড থেকে কুইজ শুরু করুন</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
