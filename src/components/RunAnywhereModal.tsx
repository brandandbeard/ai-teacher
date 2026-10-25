import React, { useState, useEffect } from 'react';
import {
  Globe,
  Smartphone,
  Terminal,
  Server,
  Copy,
  Check,
  ExternalLink,
  X,
  Download,
  Share2,
  Code2,
  ShieldCheck,
  CheckCircle2,
  GitBranch,
  FolderGit2,
} from 'lucide-react';

interface RunAnywhereModalProps {
  isOpen: boolean;
  onClose: () => void;
  sharedAppUrl: string;
}

export const RunAnywhereModal: React.FC<RunAnywhereModalProps> = ({
  isOpen,
  onClose,
  sharedAppUrl,
}) => {
  const [activeTab, setActiveTab] = useState<'direct' | 'github' | 'vercel' | 'pwa' | 'local' | 'docker' | 'api'>('github');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const handleBeforeInstall = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  if (!isOpen) return null;

  const copyToClipboard = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
    }
  };

  const githubPushCommands = `# 1. Initialize git (if starting from downloaded files)
git init
git add .
git commit -m "feat: complete Gemini Live Voice & Vision assistant"

# 2. Set default branch to main
git branch -M main

# 3. Connect to your GitHub repository
git remote add origin https://github.com/<your-username>/<your-repo-name>.git

# 4. Push all code to GitHub
git push -u origin main`;

  const localSetupCommands = `# 1. Clone or download your project repository
git clone <your-repo-url>
cd gemini-live-app

# 2. Install dependencies
npm install

# 3. Create .env file with your Gemini API Key
echo 'GEMINI_API_KEY="your-api-key-here"' > .env

# 4. Start the app locally
npm run dev
# App will run on http://localhost:3000 with full WebSocket voice support!`;

  const dockerCommands = `# 1. Build the production Docker container
docker build -t gemini-live-app .

# 2. Run the container with your Gemini API Key
docker run -d \\
  -p 3000:3000 \\
  -e GEMINI_API_KEY="your-api-key-here" \\
  --name gemini-live \\
  gemini-live-app

# 3. Access in any browser at http://localhost:3000`;

  const pythonScript = `import asyncio
import os
from google import genai
from google.genai import types

# Set your API key
client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

async def main():
    # Connect directly to Gemini Live
    async with client.aio.live.connect(
        model="gemini-3.8-live",
        config=types.LiveConnectConfig(
            response_modalities=[types.Modality.AUDIO],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Zephyr")
                )
            ),
        ),
    ) as session:
        print("Connected to Gemini Live! Sending greeting...")
        await session.send(input="Hello! How are you today?", end_of_turn=True)
        async for response in session.receive():
            server_content = response.server_content
            if server_content is not None:
                # Received live audio or text chunk
                model_turn = server_content.model_turn
                if model_turn is not None:
                    for part in model_turn.parts:
                        if part.text:
                            print(part.text, end="", flush=True)

if __name__ == "__main__":
    asyncio.run(main())`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-600 text-white shadow-lg shadow-emerald-500/20">
              <Share2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Use Gemini Live Anywhere
              </h2>
              <p className="text-xs text-slate-400">
                You do NOT need to stay in Google AI Studio to run this app!
              </p>
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
            onClick={() => setActiveTab('github')}
            className={`flex items-center gap-2 py-3 px-3 font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'github'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FolderGit2 className="h-4 w-4" />
            GitHub Repository & Export
          </button>
          <button
            onClick={() => setActiveTab('vercel')}
            className={`flex items-center gap-2 py-3 px-3 font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'vercel'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Globe className="h-4 w-4 text-cyan-400" />
            Vercel & Custom Domain
          </button>
          <button
            onClick={() => setActiveTab('direct')}
            className={`flex items-center gap-2 py-3 px-3 font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'direct'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Globe className="h-4 w-4" />
            Direct Web Link
          </button>
          <button
            onClick={() => setActiveTab('pwa')}
            className={`flex items-center gap-2 py-3 px-3 font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'pwa'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Smartphone className="h-4 w-4" />
            Install as Mobile App
          </button>
          <button
            onClick={() => setActiveTab('local')}
            className={`flex items-center gap-2 py-3 px-3 font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'local'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="h-4 w-4" />
            Run on PC
          </button>
          <button
            onClick={() => setActiveTab('docker')}
            className={`flex items-center gap-2 py-3 px-3 font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'docker'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Server className="h-4 w-4" />
            Docker
          </button>
          <button
            onClick={() => setActiveTab('api')}
            className={`flex items-center gap-2 py-3 px-3 font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'api'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code2 className="h-4 w-4" />
            Python SDK
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-slate-300">
          {activeTab === 'github' && (
            <div className="space-y-6">
              <div className="rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-5">
                <h3 className="text-base font-semibold text-indigo-300 flex items-center gap-2">
                  <GitBranch className="h-5 w-5 text-indigo-400" />
                  How to Put This Project on GitHub
                </h3>
                <p className="mt-2 text-sm text-slate-300 leading-relaxed">
                  Your project is structured as a standard full-stack repository with a production <code className="text-cyan-300">README.md</code>, <code className="text-cyan-300">Dockerfile</code>, and <code className="text-cyan-300">package.json</code>. You can export it to GitHub in two ways:
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {/* Method 1: In AI Studio */}
                <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                  <div className="font-bold text-white flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[11px] text-white">1</span>
                    <span>Method 1: Direct Export from AI Studio (Easiest)</span>
                  </div>
                  <ol className="list-decimal list-inside space-y-1.5 text-slate-300">
                    <li>Look at the top-right corner or file tree panel in <strong>Google AI Studio</strong>.</li>
                    <li>Click the <strong>Export</strong> or <strong>GitHub</strong> button.</li>
                    <li>Authenticate with your GitHub account.</li>
                    <li>Choose a repository name (e.g. <code className="text-cyan-300">gemini-live-assistant</code>) and click <strong>Create / Export</strong>.</li>
                    <li>Your full codebase, commits, and files are instantly published to your GitHub!</li>
                  </ol>
                </div>

                {/* Method 2: Command Line */}
                <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                  <div className="font-bold text-white flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-[11px] text-white">2</span>
                    <span>Method 2: Push via Git Terminal</span>
                  </div>
                  <p className="text-slate-400">
                    If you downloaded the code or cloned it, use these standard terminal commands to push to any new GitHub repo:
                  </p>
                  <button
                    onClick={() => copyToClipboard('git', githubPushCommands)}
                    className="mt-1 flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-[11px] transition-colors"
                  >
                    {copiedKey === 'git' ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                    {copiedKey === 'git' ? 'Copied Commands' : 'Copy Git Push Commands'}
                  </button>
                </div>
              </div>

              {/* Git Commands Block */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Git Terminal Commands
                  </span>
                  <button
                    onClick={() => copyToClipboard('git', githubPushCommands)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 transition-colors"
                  >
                    {copiedKey === 'git' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedKey === 'git' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-emerald-400 overflow-x-auto leading-relaxed">
                  <code>{githubPushCommands}</code>
                </pre>
              </div>

              {/* Blank Page Troubleshooting Card */}
              <div className="rounded-xl border border-red-500/40 bg-red-950/20 p-4 space-y-2 text-xs">
                <div className="font-bold text-red-300 flex items-center gap-2">
                  <span>🚨 Seeing a Blank Page on GitHub Pages? Here is the exact fix:</span>
                </div>
                <p className="text-slate-300 leading-relaxed">
                  If GitHub Pages shows a blank white page, it is because GitHub Pages is trying to serve raw, uncompiled <code className="text-red-200">src/main.tsx</code> directly. Browsers cannot run TypeScript source files without compiling them to JavaScript first.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                    <span className="font-semibold text-emerald-400">Method 1 (Fastest CLI):</span>
                    <p className="text-slate-400 text-[11px]">Run this command in terminal:</p>
                    <code className="block bg-slate-950 p-1.5 rounded text-emerald-300 font-mono text-[11px]">npm run deploy</code>
                    <p className="text-[10px] text-slate-500">This automatically builds <code className="text-slate-400">dist</code> and pushes to the <code className="text-slate-400">gh-pages</code> branch!</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                    <span className="font-semibold text-cyan-400">Method 2 (In GitHub Settings):</span>
                    <p className="text-slate-400 text-[11px]">
                      Go to GitHub repository &gt; <strong>Settings</strong> &gt; <strong>Pages</strong> &gt; under <strong>Source</strong>, select <strong>GitHub Actions</strong> instead of "Deploy from a branch".
                    </p>
                  </div>
                </div>
              </div>

              {/* GitHub Secrets note */}
              <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 space-y-1 text-xs">
                <div className="font-semibold text-amber-300 flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4" />
                  Storing your API Key on GitHub
                </div>
                <p className="text-slate-300 leading-relaxed">
                  Never commit your actual <code className="text-amber-200">.env</code> file or secret keys directly to a public GitHub repository. (The <code className="text-slate-200">.gitignore</code> file automatically excludes <code className="text-slate-200">.env</code>). When deploying from GitHub (e.g., to Vercel, Render, or Cloud Run), store your key in the provider's <strong>Environment Variables</strong> or in GitHub <strong>Repository Secrets</strong> (<code className="text-slate-200">Settings &gt; Secrets and variables &gt; Actions</code>).
                </p>
              </div>
            </div>
          )}

          {activeTab === 'vercel' && (
            <div className="space-y-6">
              <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-5">
                <h3 className="text-base font-semibold text-cyan-300 flex items-center gap-2">
                  <Globe className="h-5 w-5 text-cyan-400" />
                  Deploying to Vercel with Your Own Custom Domain
                </h3>
                <p className="mt-2 text-sm text-slate-300 leading-relaxed">
                  হ্যাঁ! আপনি খুব সহজেই এই সম্পূর্ণ অ্যাপটিকে Vercel-এ পাবলিকলি ডেপ্লয় করতে পারেন এবং আপনার নিজের যেকোনো কাস্টম ডোমেন (যেমন <code className="text-cyan-300">yourname.com</code> বা <code className="text-cyan-300">study.yourdomain.com</code>) বিনামূল্যে যুক্ত করতে পারেন।
                </p>
              </div>

              {/* 3 Step Deployment Cards */}
              <div className="space-y-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  ৩টি সহজ ধাপে Vercel-এ ডেপ্লয় ও কাস্টম ডোমেন সেটআপ:
                </span>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  {/* Step 1 */}
                  <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                    <div className="font-bold text-white flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-600 text-[11px] text-white">1</span>
                      <span>GitHub-এ Export করুন</span>
                    </div>
                    <p className="text-slate-300 leading-relaxed">
                      AI Studio-র উপরে থাকা <strong>Export / GitHub</strong> বোতামে ক্লিক করে কোডটি আপনার নিজের GitHub অ্যাকাউন্টে একটি নতুন রিপোজিটরিতে এক্সপোর্ট করে নিন।
                    </p>
                  </div>

                  {/* Step 2 */}
                  <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                    <div className="font-bold text-white flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[11px] text-white">2</span>
                      <span>Vercel-এ Import করুন</span>
                    </div>
                    <p className="text-slate-300 leading-relaxed">
                      <strong>vercel.com</strong>-এ গিয়ে <strong>Add New &gt; Project</strong> ক্লিক করুন এবং আপনার GitHub রিপোজিটরিটি সিলেক্ট করুন। <code className="text-cyan-300">vercel.json</code> থাকায় ফ্রেমওয়ার্ক অটোমেটিক <strong>Vite</strong> সিলেক্ট হয়ে যাবে। সরাসরি <strong>Deploy</strong> চাপুন।
                    </p>
                  </div>

                  {/* Step 3 */}
                  <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                    <div className="font-bold text-white flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-[11px] text-white">3</span>
                      <span>Add Custom Domain</span>
                    </div>
                    <p className="text-slate-300 leading-relaxed">
                      Vercel ড্যাশবোর্ডে গিয়ে <strong>Settings &gt; Domains</strong>-এ যান। আপনার ডোমেন লিখুন (যেমন: <code className="text-emerald-300">app.yourname.com</code>) এবং Add করুন।
                    </p>
                  </div>
                </div>
              </div>

              {/* DNS Records Guide */}
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-3 text-xs">
                <div className="font-bold text-slate-200 flex items-center justify-between">
                  <span>ডোমেন প্রোভাইডারে (Namecheap / GoDaddy / Cloudflare) DNS সেটিংস:</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono text-[11px]">
                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                    <span className="text-cyan-400 font-sans font-semibold">মেইন ডোমেন হলে (যেমন yourname.com):</span>
                    <div className="text-slate-300">Type: <span className="text-amber-300">A</span></div>
                    <div className="text-slate-300">Name: <span className="text-amber-300">@</span></div>
                    <div className="text-slate-300">Value / Target: <span className="text-emerald-400">76.76.21.21</span></div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                    <span className="text-indigo-400 font-sans font-semibold">সাব-ডোমেন হলে (যেমন study.yourname.com):</span>
                    <div className="text-slate-300">Type: <span className="text-amber-300">CNAME</span></div>
                    <div className="text-slate-300">Name: <span className="text-amber-300">study</span> (বা app)</div>
                    <div className="text-slate-300">Value / Target: <span className="text-emerald-400">cname.vercel-dns.com</span></div>
                  </div>
                </div>
              </div>

              {/* Real-time Voice Architecture Note */}
              <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/20 p-4 space-y-2 text-xs">
                <div className="font-bold text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>লাইভ ভয়েস ও ওয়েবসকেট সংযোগের অটো-কনফিগারেশন:</span>
                </div>
                <p className="text-slate-300 leading-relaxed">
                  জেমিলাইভ (Gemini Live) রিয়েল-টাইম বাইডিরেকশনাল অডিও স্ট্রিমিংয়ের জন্য পারসিস্টেন্ট WebSocket ব্যবহার করে। আপনার অ্যাপটিতে ইতিমধ্যে কোড আপডেট করা হয়েছে যাতে Vercel বা আপনার কাস্টম ডোমেন থেকে খুললেও এটি স্বয়ংক্রিয়ভাবে ক্লাউড প্রক্সি ব্যাকএন্ডের (<code className="text-cyan-300">ais-pre-rhyd6xypf3o733gk6gjlaz-761573247142.asia-northeast1.run.app</code>) সঙ্গে রিয়েল-টাইম অডিও কানেক্ট হয়ে যায়। ফলে Vercel-এ কোনো বাড়তি জটিলতা ছাড়াই আপনার কাস্টম ডোমেনে ভয়েস কল পুরোপুরি পারফেক্টলি চলবে!
                </p>
              </div>
            </div>
          )}

          {activeTab === 'direct' && (
            <div className="space-y-6">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-5">
                <h3 className="text-base font-semibold text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  Your App is Already Deployed & Live!
                </h3>
                <p className="mt-2 text-sm text-slate-300 leading-relaxed">
                  You do <strong>not</strong> need to open Google AI Studio every time. Your application has its own dedicated, permanently hosted web address that works directly in any browser on any phone, tablet, or computer.
                </p>
              </div>

              {/* URL Box */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Your Standalone Live Web App URL:
                </label>
                <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-950 border border-slate-800">
                  <input
                    type="text"
                    readOnly
                    value={sharedAppUrl}
                    className="flex-1 bg-transparent px-3 text-xs font-mono text-cyan-300 outline-none select-all"
                  />
                  <button
                    onClick={() => copyToClipboard('url', sharedAppUrl)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-all shrink-0"
                  >
                    {copiedKey === 'url' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedKey === 'url' ? 'Copied!' : 'Copy Link'}
                  </button>
                  <a
                    href={sharedAppUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors shrink-0"
                    title="Open in new browser tab"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                  <div className="font-semibold text-white">📱 Phone & Tablet</div>
                  <p className="text-slate-400">
                    Bookmark the link in Safari or Chrome on your phone to start voice conversations anytime.
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                  <div className="font-semibold text-white">👥 Share with Others</div>
                  <p className="text-slate-400">
                    Send the link to friends or colleagues. They can test Gemini Live without an AI Studio account.
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                  <div className="font-semibold text-white">🔒 Secure Server-Side Key</div>
                  <p className="text-slate-400">
                    Your API key stays safe on the server and is never sent to the visitor's browser.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'pwa' && (
            <div className="space-y-6">
              <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-5">
                <h3 className="text-base font-semibold text-cyan-300 flex items-center gap-2">
                  <Smartphone className="h-5 w-5 text-cyan-400" />
                  Install as a Standalone App (PWA)
                </h3>
                <p className="mt-2 text-sm text-slate-300 leading-relaxed">
                  Turn this web application into an app on your phone home screen or desktop. It launches in full-screen mode without any browser tabs or search bars, just like a native app downloaded from the App Store.
                </p>

                {deferredPrompt && (
                  <button
                    onClick={handleInstallClick}
                    className="mt-4 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 text-white font-bold text-xs shadow-lg shadow-cyan-500/25 hover:brightness-110 transition-all"
                  >
                    <Download className="h-4 w-4" />
                    Install Gemini Live to Device
                  </button>
                )}

                {isInstalled && (
                  <div className="mt-3 text-xs text-emerald-400 flex items-center gap-1.5 font-medium">
                    <CheckCircle2 className="h-4 w-4" />
                    App is already installed and running in standalone mode!
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                  <div className="font-bold text-white flex items-center gap-2">
                    <span>🍏 iPhone / iPad (Safari)</span>
                  </div>
                  <ol className="list-decimal list-inside space-y-1.5 text-slate-300">
                    <li>Open the Shared App URL in <strong>Safari</strong>.</li>
                    <li>Tap the <strong>Share</strong> button (box with an arrow pointing up at the bottom).</li>
                    <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
                    <li>Tap <strong>Add</strong> in the top right. It will appear on your home screen!</li>
                  </ol>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                  <div className="font-bold text-white flex items-center gap-2">
                    <span>🤖 Android (Chrome / Edge)</span>
                  </div>
                  <ol className="list-decimal list-inside space-y-1.5 text-slate-300">
                    <li>Open the Shared App URL in <strong>Chrome</strong>.</li>
                    <li>Tap the three vertical dots (<strong>⋮</strong>) in the top-right corner.</li>
                    <li>Tap <strong>Install App</strong> or <strong>Add to Home screen</strong>.</li>
                    <li>Confirm install. The Gemini Live icon will be added to your apps.</li>
                  </ol>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'local' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">Run Standalone on Your PC / Laptop</h3>
                  <p className="text-xs text-slate-400">Clone the codebase and run it locally with Node.js.</p>
                </div>
                <button
                  onClick={() => copyToClipboard('local', localSetupCommands)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 transition-colors"
                >
                  {copiedKey === 'local' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedKey === 'local' ? 'Copied' : 'Copy Commands'}
                </button>
              </div>

              <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-emerald-400 overflow-x-auto leading-relaxed">
                <code>{localSetupCommands}</code>
              </pre>

              <div className="rounded-lg bg-slate-950/60 border border-slate-800 p-3 text-xs text-slate-400 space-y-1">
                <span className="font-semibold text-slate-200">Prerequisites:</span>
                <div>• Node.js 18 or newer installed on your machine (<code className="text-cyan-300">node -v</code>).</div>
                <div>• A free Gemini API key from <a href="https://aistudio.google.com" target="_blank" rel="noreferrer" className="text-cyan-400 underline">aistudio.google.com</a>.</div>
              </div>
            </div>
          )}

          {activeTab === 'docker' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">Deploy with Docker / Cloud Run</h3>
                  <p className="text-xs text-slate-400">We have included a production-ready <code className="text-cyan-300">Dockerfile</code>.</p>
                </div>
                <button
                  onClick={() => copyToClipboard('docker', dockerCommands)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 transition-colors"
                >
                  {copiedKey === 'docker' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedKey === 'docker' ? 'Copied' : 'Copy Docker Snippet'}
                </button>
              </div>

              <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-cyan-300 overflow-x-auto leading-relaxed">
                <code>{dockerCommands}</code>
              </pre>

              <p className="text-xs text-slate-400">
                You can push this Docker image to <strong>Google Cloud Run</strong>, <strong>Render</strong>, <strong>Fly.io</strong>, or any VPS (Ubuntu/Debian) to host your own private instance 24/7.
              </p>
            </div>
          )}

          {activeTab === 'api' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">Use Gemini Live Directly in Python / Backend</h3>
                  <p className="text-xs text-slate-400">Call Google Live directly without any web interface.</p>
                </div>
                <button
                  onClick={() => copyToClipboard('python', pythonScript)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 transition-colors"
                >
                  {copiedKey === 'python' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedKey === 'python' ? 'Copied' : 'Copy Python Code'}
                </button>
              </div>

              <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300 overflow-x-auto leading-relaxed max-h-72">
                <code>{pythonScript}</code>
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-800 bg-slate-950/80 px-6 py-4 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            Open the link anytime on your phone or desktop: <span className="font-mono text-cyan-400 truncate max-w-xs inline-block align-bottom">{sharedAppUrl}</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-white transition-all"
          >
            Got It!
          </button>
        </div>
      </div>
    </div>
  );
};
