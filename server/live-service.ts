import { FunctionDeclaration, GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";
import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage, ServerResponse } from "http";
import dotenv from "dotenv";
import { sanitizeBilingualText } from "../src/utils/bilingualFilter.ts";

dotenv.config();

function getApiKey(): string {
  return process.env.GEMINI_API_KEY || "";
}

// Multi-model fallback sequence for text/JSON analysis
const CANDIDATE_MODELS = [
  "gemini-3.8-flash",
  "gemini-2.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash-lite",
];

async function generateWithModelFallback(
  ai: GoogleGenAI,
  models: string[],
  options: { contents: any; config?: any }
): Promise<{ text: string; modelUsed: string } | null> {
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: options.contents,
          config: options.config,
        });
        const text = response.text?.trim() || "";
        if (text) {
          return { text, modelUsed: model };
        }
      } catch (err: any) {
        const errMsg = (err?.message || "").toLowerCase();
        const isTransient =
          errMsg.includes("503") ||
          errMsg.includes("high demand") ||
          errMsg.includes("unavailable") ||
          errMsg.includes("overloaded") ||
          errMsg.includes("resource_exhausted") ||
          errMsg.includes("429") ||
          errMsg.includes("rate");

        console.warn(`[ModelFallback] Attempt ${attempt + 1} with ${model} failed: ${err.message}`);
        if (attempt === 0 && isTransient) {
          await new Promise((r) => setTimeout(r, 600));
        } else {
          break; // proceed to next candidate model
        }
      }
    }
  }
  return null;
}

async function fetchYouTubeOEmbed(url: string): Promise<{ title?: string; author?: string; thumbnail?: string; videoId?: string } | null> {
  const ytRegex = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/|live\/))([a-zA-Z0-9_-]{11})/i;
  const match = (url || "").match(ytRegex);
  const videoId = match ? match[1] : undefined;
  const defaultThumb = videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : undefined;

  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const data: any = await res.json();
      return {
        title: data.title,
        author: data.author_name,
        thumbnail: data.thumbnail_url || defaultThumb,
        videoId,
      };
    }
  } catch (_e) {
    // Continue with default thumbnail
  }

  return { thumbnail: defaultThumb, videoId };
}

export function attachLiveServer(httpServer: any, middlewareApp?: any) {
  const wss = new WebSocketServer({ noServer: true });

  // Handle upgrade for /live-ws
  httpServer.on("upgrade", (request: IncomingMessage, socket: any, head: any) => {
    const { pathname } = new URL(request.url || "", `http://${request.headers.host || "localhost"}`);
    if (pathname === "/live-ws") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    }
  });

  // Attach HTTP routes if middlewareApp is available
  if (middlewareApp) {
    // CORS headers for all requests
    middlewareApp.use((req: any, res: any, next: any) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

      if (req.method === "OPTIONS") {
        res.statusCode = 204;
        res.end();
        return;
      }
      next();
    });

    // Health endpoint
    middlewareApp.get("/api/health", (_req: any, res: any) => {
      res.setHeader("Content-Type", "application/json");
      res.status(200).json({
        status: "ok",
        hasApiKey: Boolean(getApiKey()),
        models: [
          "gemini-3.8-live",
          "gemini-3.8-live-extended-thinking",
          "gemini-3.5-transcribe-live"
        ],
        voices: ["Zephyr", "Puck", "Charon", "Kore", "Fenrir"],
      });
    });

    // Voice preview endpoint
    middlewareApp.post("/api/gemini/voice-preview", async (req: any, res: any) => {
      try {
        const { voice = "Zephyr", text = "Hello! I am ready for our Gemini Live conversation." } = req.body || {};
        const apiKey = getApiKey();
        if (!apiKey) {
          return res.status(500).json({ error: "GEMINI_API_KEY is not configured" });
        }

        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: {
            headers: {
              "User-Agent": "aistudio-build",
            },
          },
        });

        const response = await ai.models.generateContent({
          model: "gemini-3.8-flash-lite-tts",
          contents: [
            {
              role: "user",
              parts: [{ text }],
            },
          ],
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: voice },
              },
            },
          },
        });

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        res.status(200).json({ audioWavBase64: base64Audio, voice });
      } catch (err: any) {
        res.status(500).json({ error: err.message || "Failed to generate preview" });
      }
    });

    // Chapter lookup endpoint
    middlewareApp.post("/api/lookup-chapter", async (req: any, res: any) => {
      try {
        const { className = "Class 10", subject = "বিজ্ঞান", query = "" } = req.body || {};
        const apiKey = getApiKey();
        if (!apiKey) {
          return res.status(500).json({ error: "GEMINI_API_KEY is not configured" });
        }

        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: {
            headers: {
              "User-Agent": "aistudio-build",
            },
          },
        });

        const prompt = `You are a West Bengal Board of Secondary Education (WBBSE) syllabus curriculum expert.
The user is asking about: "${query}" for ${className} in subject "${subject}".
Identify the exact official WBBSE syllabus chapter title and core topics in Bengali (বাংলা).
Return ONLY a short clean title string like "অধ্যায় ৩: পদার্থের অবস্থা ও গ্যাসীয় আচরণ" or "জৈব রসায়ন: হাইড্রোকার্বন ও কার্যকরী মূলক".`;

        const result = await generateWithModelFallback(ai, CANDIDATE_MODELS, { contents: prompt });
        const resolvedTitle = result?.text?.trim().replace(/^["']|["']$/g, "") || query;
        res.status(200).json({ resolvedTitle, className, subject, query });
      } catch (err: any) {
        res.status(500).json({ error: err.message || "Failed to lookup chapter" });
      }
    });

    // NotebookLM: Parse & Extract Source (YouTube, PDF, Drive, Image, Text)
    middlewareApp.post("/api/notebook/parse-source", async (req: any, res: any) => {
      try {
        const { type, title, url: sourceUrl, content, mimeType, fileName, fileSize } = req.body || {};
        const apiKey = getApiKey();

        let finalTitle = title || fileName || "Untitled Study Source";
        let thumbnailUrl: string | undefined;
        let ytMeta: { title?: string; author?: string; thumbnail?: string; videoId?: string } | null = null;

        if (type === "youtube" && sourceUrl) {
          ytMeta = await fetchYouTubeOEmbed(sourceUrl);
          if (ytMeta?.thumbnail) {
            thumbnailUrl = ytMeta.thumbnail;
          }
          if (ytMeta?.title) {
            finalTitle = title?.trim() || ytMeta.title.trim();
          } else if (!title?.trim() && ytMeta?.videoId) {
            finalTitle = `ইউটিউব ভিডিও (${ytMeta.videoId})`;
          }
        }

        const parts: any[] = [];

        if (type === "youtube") {
          parts.push({
            text: `You are Google NotebookLM's master educational source parser.
The user added this YouTube video source: ${sourceUrl || ""}
Verified Video Title: "${ytMeta?.title || finalTitle}"
${ytMeta?.author ? `Channel/Teacher: "${ytMeta.author}"` : ""}
User Topic Hint: "${title || ""}"

Analyze the educational concepts, lesson structure, core definitions, and quiz takeaways for this exact video lesson: "${finalTitle}".
Return STRICT valid JSON only with NO markdown fences, matching this schema:
{
  "title": "${ytMeta?.title ? ytMeta.title.replace(/"/g, "'") : "Clear educational title of this video lesson in Bengali/English"}",
  "summary": "2-3 sentences concise executive overview of this video topic in Bengali (বাংলা)",
  "keyPoints": ["Point 1 in Bengali", "Point 2 in Bengali", "Point 3 in Bengali", "Point 4 in Bengali", "Point 5 in Bengali"],
  "content": "Detailed comprehensive study summary, definitions, formulas, and likely exam questions from this video in Bengali and English."
}`
          });
        } else if (type === "pdf") {
          if (content && typeof content === "string" && content.length > 50) {
            const cleanBase64 = content.replace(/^data:[^;]+;base64,/, "");
            parts.push({
              inlineData: {
                data: cleanBase64,
                mimeType: mimeType || "application/pdf",
              },
            });
          }
          parts.push({
            text: `You are Google NotebookLM's master educational document analyst.
Analyze this uploaded PDF study document (${fileName || title || "Document"}).
Extract the key syllabus concepts, core definitions, laws, formulas, and exam questions.
Return STRICT valid JSON only with NO markdown fences, matching this schema:
{
  "title": "Exact Chapter or Topic Title in Bengali (বাংলা)",
  "summary": "2-3 sentences concise overview of this document in Bengali (বাংলা)",
  "keyPoints": ["Crucial concept 1 in Bengali", "Crucial concept 2 in Bengali", "Crucial concept 3 in Bengali", "Crucial concept 4 in Bengali", "Crucial concept 5 in Bengali"],
  "content": "Comprehensive structured study notes, definitions, formulas, and expected viva questions in Bengali and English."
}`
          });
        } else if (type === "image") {
          if (content && typeof content === "string") {
            const cleanBase64 = content.replace(/^data:[^;]+;base64,/, "");
            parts.push({
              inlineData: {
                data: cleanBase64,
                mimeType: mimeType || "image/jpeg",
              },
            });
          }
          parts.push({
            text: `You are Google NotebookLM's visual study analyst.
Analyze this study image (e.g. textbook page, science diagram, formula sheet, or notes).
Perform visual OCR and explanation of diagrams, labels, and formulas.
Return STRICT valid JSON only with NO markdown fences, matching this schema:
{
  "title": "Topic or Diagram Title in Bengali (বাংলা)",
  "summary": "2-3 sentences summary of what is displayed and taught in this image in Bengali (বাংলা)",
  "keyPoints": ["Key visual/formula point 1 in Bengali", "Key point 2 in Bengali", "Key point 3 in Bengali", "Key point 4 in Bengali"],
  "content": "Complete transcription and comprehensive explanation of all text, diagrams, labels, and concepts visible in this image in Bengali and English."
}`
          });
        } else if (type === "drive") {
          parts.push({
            text: `You are Google NotebookLM's study source parser.
The user added a Google Drive resource / document link: ${sourceUrl || ""}
Title/Hint: "${title || "Drive Resource"}"
Analyze the academic topics, core concepts, and study notes.
Return STRICT valid JSON only with NO markdown fences, matching this schema:
{
  "title": "Concise Educational Document Title in Bengali (বাংলা)",
  "summary": "2-3 sentences executive summary in Bengali (বাংলা)",
  "keyPoints": ["Point 1 in Bengali", "Point 2 in Bengali", "Point 3 in Bengali", "Point 4 in Bengali"],
  "content": "Detailed study summary, key points, and exam questions in Bengali and English."
}`
          });
        } else {
          // Custom text note
          parts.push({
            text: `You are an expert personalized Study Assistant.
The user provided these study notes:
"""
${content || title || ""}
"""
Structure these notes for audio lecture and quiz grounding.
Return STRICT valid JSON only with NO markdown fences, matching this schema:
{
  "title": "Clean concise topic title in Bengali (বাংলা)",
  "summary": "2-3 sentences executive summary in Bengali (বাংলা)",
  "keyPoints": ["Key point 1", "Key point 2", "Key point 3", "Key point 4"],
  "content": "Expanded and structured study notes in Bengali and English."
}`
          });
        }

        let parsedResult: any = null;

        // Try LLM parsing with multi-model fallback if apiKey is present
        if (apiKey) {
          try {
            const ai = new GoogleGenAI({
              apiKey,
              httpOptions: {
                headers: {
                  "User-Agent": "aistudio-build",
                },
              },
            });

            const result = await generateWithModelFallback(ai, CANDIDATE_MODELS, {
              contents: [{ role: "user", parts }],
            });

            if (result?.text) {
              const cleanedJson = result.text.replace(/```json/gi, "").replace(/```/g, "").trim();
              try {
                parsedResult = JSON.parse(cleanedJson);
              } catch (pErr) {
                parsedResult = {
                  title: finalTitle,
                  summary: result.text.slice(0, 300),
                  keyPoints: ["গুরুত্বপূর্ণ বিষয়বস্তু ও আলোচনা"],
                  content: result.text,
                };
              }
            }
          } catch (llmErr) {
            console.warn("[LiveGateway] LLM parsing encountered transient issue, using reliable fallback:", llmErr);
          }
        }

        // Guaranteed fallback synthesis if LLM was unavailable, 503 overloaded, or returned null
        if (!parsedResult) {
          const authorHint = ytMeta?.author ? ` (${ytMeta.author})` : "";
          parsedResult = {
            title: finalTitle,
            summary: type === "youtube"
              ? `${finalTitle} - ইউটিউব ভিডিও সোর্সটি সফলভাবে যুক্ত হয়েছে${authorHint}। লাইভ ক্লাসে শিক্ষক এই ভিডিওটির বিষয়বস্তুর ওপর আলোচনা ও মৌখিক কুইজ পরিচালনা করবেন।`
              : `${finalTitle} - উপাদানটি সফলভাবে সংরক্ষিত হয়েছে। লাইভ সেশনে শিক্ষক এর বিষয়বস্তু নিয়ে আলোচনা করবেন।`,
            keyPoints: [
              type === "youtube" ? "ইউটিউব ভিডিও লেকচার সোর্স" : "স্টাডি সোর্স উপাদান",
              `মূল বিষয়বস্তু: ${finalTitle}`,
              ytMeta?.author ? `চ্যানেল/শিক্ষক: ${ytMeta.author}` : "ভিডিও পাঠ্য উপাদান",
              "লাইভ ক্লাসে অডিও ও মৌখিক কুইজ সমর্থিত",
              "শিক্ষকের সাথে সরাসরি প্রশ্ন-উত্তর ও বিশ্লেষণ"
            ],
            content: type === "youtube"
              ? `YouTube Video URL: ${sourceUrl}\nTitle: ${finalTitle}${ytMeta?.author ? `\nAuthor/Channel: ${ytMeta.author}` : ""}\n\nএই সোর্সটি Google NotebookLM স্টাডি সোর্স হিসেবে সক্রিয়। শিক্ষক এই ভিডিওটির মূল তত্ত্ব, সংজ্ঞা ও সূত্র নিয়ে আলোচনা করবেন এবং মৌখিক কুইজ পরিচালনা করবেন।`
              : (content || title || finalTitle),
          };
        }

        const sourceObject = {
          id: `src-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          type,
          title: parsedResult.title || finalTitle,
          summary: parsedResult.summary || "স্টাডি সোর্সের সারসংক্ষেপ প্রস্তুত।",
          keyPoints: Array.isArray(parsedResult.keyPoints) ? parsedResult.keyPoints : [],
          content: parsedResult.content || parsedResult.detailedContent || content || "",
          url: sourceUrl,
          thumbnailUrl,
          fileName,
          fileSize,
          isActive: true,
          createdAt: Date.now(),
        };

        res.status(200).json(sourceObject);
      } catch (err: any) {
        console.error("[LiveGateway] Notebook parse-source critical fallback:", err);
        // Absolute fail-safe: always return a usable source instead of 500
        const safeTitle = (req.body?.title || req.body?.fileName || "সংযুক্ত স্টাডি উপাদান").trim();
        res.status(200).json({
          id: `src-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          type: req.body?.type || "youtube",
          title: safeTitle,
          summary: `${safeTitle} - সোর্সটি সফলভাবে সংরক্ষিত হয়েছে। ক্লাসে এটি নিয়ে আলোচনা করা যাবে।`,
          keyPoints: ["সংযুক্ত স্টাডি উপাদান", `মূল বিষয়: ${safeTitle}`, "লাইভ আলোচনা ও কুইজ প্রস্তুত"],
          content: req.body?.url ? `Source URL: ${req.body.url}` : safeTitle,
          url: req.body?.url,
          isActive: true,
          createdAt: Date.now(),
        });
      }
    });

    // NotebookLM: Generate Comprehensive Study Guide & Viva Questions from Active Sources
    middlewareApp.post("/api/notebook/generate-study-guide", async (req: any, res: any) => {
      try {
        const { sources = [] } = req.body || {};
        const apiKey = getApiKey();

        if (!sources || sources.length === 0) {
          return res.status(400).json({ error: "No sources provided to generate study guide" });
        }

        let studyGuide: any = null;

        if (apiKey) {
          try {
            const ai = new GoogleGenAI({
              apiKey,
              httpOptions: {
                headers: {
                  "User-Agent": "aistudio-build",
                },
              },
            });

            const sourceBriefs = sources.map((s: any, idx: number) => {
              return `Source ${idx + 1} [${s.type.toUpperCase()}]: ${s.title}\nSummary: ${s.summary}\nKey Points: ${(s.keyPoints || []).join(', ')}\nContent: ${(s.content || '').slice(0, 800)}`;
            }).join('\n\n');

            const prompt = `You are an expert Study Guide & Oral Viva Questions generator.
The student has loaded the following verified study sources:
"""
${sourceBriefs}
"""

Synthesize a comprehensive, beautiful Study Guide in Bengali (বাংলা) for the student.
Return STRICT valid JSON only with NO markdown fences matching this schema:
{
  "title": "স্টাডি সোর্স গাইড: মূল শিরোনাম",
  "overview": "সার্বিক পাঠ্যক্রমের গভীর ও পুঙ্খানুপুঙ্খ বিবরণ (২-৩ প্যারাগ্রাফ বাংলায়)",
  "keyConcepts": [
    {"term": "পরিভাষা ১", "definition": "সংজ্ঞা ও গুরুত্ব বাংলায়"},
    {"term": "পরিভাষা ২", "definition": "সংজ্ঞা ও গুরুত্ব বাংলায়"},
    {"term": "পরিভাষা ৩", "definition": "সংজ্ঞা ও গুরুত্ব বাংলায়"},
    {"term": "পরিভাষা ৪", "definition": "সংজ্ঞা ও গুরুত্ব বাংলায়"},
    {"term": "পরিভাষা ৫", "definition": "সংজ্ঞা ও গুরুত্ব বাংলায়"}
  ],
  "quizQuestions": [
    {"question": "মৌখিক প্রশ্ন ১?", "answer": "সঠিক উত্তর ও কারণ"},
    {"question": "মৌখিক প্রশ্ন ২?", "answer": "সঠিক উত্তর ও কারণ"},
    {"question": "মৌখিক প্রশ্ন ৩?", "answer": "সঠিক উত্তর ও কারণ"},
    {"question": "মৌখিক প্রশ্ন ৪?", "answer": "সঠিক উত্তর ও কারণ"},
    {"question": "মৌখিক প্রশ্ন ৫?", "answer": "সঠিক উত্তর ও কারণ"}
  ],
  "suggestedTopics": [
    "গভীর আলোচনার বিষয় ১",
    "গভীর আলোচনার বিষয় ২",
    "গভীর আলোচনার বিষয় ৩"
  ]
}`;

            const result = await generateWithModelFallback(ai, CANDIDATE_MODELS, { contents: prompt });
            if (result?.text) {
              const cleanedJson = result.text.replace(/```json/gi, "").replace(/```/g, "").trim();
              studyGuide = JSON.parse(cleanedJson);
            }
          } catch (llmErr) {
            console.warn("[LiveGateway] Study guide generation LLM fallback:", llmErr);
          }
        }

        // Guaranteed fallback synthesis if LLM 503s or unavailable
        if (!studyGuide) {
          const firstTitle = sources[0]?.title || "স্টাডি উপাদান";
          const allKeyPoints = sources.flatMap((s: any) => s.keyPoints || []);
          studyGuide = {
            title: `স্টাডি গাইড: ${firstTitle}`,
            overview: sources.map((s: any) => `${s.title}: ${s.summary}`).join("\n\n"),
            keyConcepts: (allKeyPoints.length > 0 ? allKeyPoints.slice(0, 5) : [firstTitle]).map((pt: string, idx: number) => ({
              term: `মূল ধারণা ${idx + 1}`,
              definition: pt,
            })),
            quizQuestions: [
              { question: `${firstTitle}-এর প্রধান মূল বিষয়টি কী এবং এর গুরুত্ব আলোচনা করো?`, answer: "সোর্সে প্রদত্ত সংজ্ঞা ও ব্যাখ্যার ওপর ভিত্তি করে উত্তর দিন।" },
              { question: "এই পাঠের মূল সূত্র বা সিদ্ধান্ত কী কী?", answer: "পাঠ্য উপাদানের মূল সিদ্ধান্তসমূহ উল্লেখ করুন।" },
              { question: "বাস্তব ক্ষেত্রে এই তত্ত্ব কীভাবে প্রয়োগ করা হয়?", answer: "বাস্তব উদাহরণ ও প্রায়োগিক দিক ব্যাখ্যা করুন।" }
            ],
            suggestedTopics: sources.map((s: any) => s.title).slice(0, 3),
          };
        }

        studyGuide.generatedAt = Date.now();
        res.status(200).json(studyGuide);
      } catch (err: any) {
        console.error("[LiveGateway] Study guide error:", err);
        res.status(200).json({
          title: "স্টাডি গাইড",
          overview: "আপনার সক্রিয় সোর্সসমূহ লাইভ ক্লাসের জন্য প্রস্তুত।",
          keyConcepts: [{ term: "প্রধান বিষয়", definition: "যুক্ত করা উপাদান" }],
          quizQuestions: [{ question: "এই পাঠের মূল ধারণাটি বুঝিয়ে বলো?", answer: "সংযুক্ত সোর্স অনুযায়ী উত্তর।" }],
          suggestedTopics: ["মূল বিষয়ের ওপর আলোচনা"],
          generatedAt: Date.now(),
        });
      }
    });

    // Explicit 404 for unknown /api routes to guarantee valid JSON and prevent SPA index.html bleeding
    middlewareApp.all("/api/*", (_req: any, res: any) => {
      res.status(404).json({ error: "API route not found" });
    });
  }

  // Handle Live WebSocket connections
  wss.on("connection", (clientWs: WebSocket) => {
    let liveSession: any = null;
    let isConnected = false;
    let isReconnecting = false;
    let lastResumptionHandle: string | null = null;
    let sessionParams: {
      modelName: string;
      voiceName: string;
      systemInstruction: string;
      contextSummary?: any;
    } = {
      modelName: "gemini-3.8-live",
      voiceName: "Kore",
      systemInstruction: "You are a friendly, highly capable real-time conversational AI. Keep spoken responses clear, lively, concise, and natural.",
    };

    // Audio buffer to queue client speech during brief server reconnection transitions (~200ms)
    const pendingAudioQueue: string[] = [];
    // Text buffer to queue student text messages while session is initializing or reconnecting
    const pendingTextQueue: string[] = [];

    // Heartbeat keep-alive every 10s to prevent proxy/Cloud Run idle timeouts
    const heartbeatInterval = setInterval(() => {
      if (clientWs.readyState === WebSocket.OPEN) {
        try {
          clientWs.ping();
          clientWs.send(JSON.stringify({ type: "heartbeat", timestamp: Date.now() }));
        } catch (e) {}
      }
    }, 10000);

    // Helper to connect or reconnect to Gemini Live API with durable context fallback
    async function establishGeminiSession(resumeHandle?: string | null, retryWithoutHandle = false) {
      const apiKey = getApiKey();
      if (!apiKey) {
        clientWs.send(
          JSON.stringify({
            type: "error",
            message: "GEMINI_API_KEY is not configured in environment.",
          })
        );
        return;
      }

      const { modelName, voiceName, systemInstruction } = sessionParams;

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

      // Tools for real-time Live function calling
      const getTimeDeclaration: FunctionDeclaration = {
        name: "get_current_time",
        description: "Get the current time, date, and user timezone.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            dummy: {
              type: Type.STRING,
              description: "Optional query context",
            },
          },
        },
      };

      const calculateDeclaration: FunctionDeclaration = {
        name: "calculate_expression",
        description: "Calculate a mathematical expression accurately.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            expression: {
              type: Type.STRING,
              description: "Math formula to evaluate, e.g. '15 * 84' or 'Math.sqrt(144)'",
            },
          },
          required: ["expression"],
        },
      };

      const tools = [
        {
          functionDeclarations: [getTimeDeclaration, calculateDeclaration],
        },
      ];

      const effectiveHandle = retryWithoutHandle ? undefined : (resumeHandle || lastResumptionHandle || undefined);

      try {
        if (liveSession) {
          try {
            liveSession.close();
          } catch (e) {}
          liveSession = null;
        }

        console.log(`[LiveGateway] Connecting to Gemini Live (${modelName}) ${effectiveHandle ? `with resumption handle: ${effectiveHandle.slice(0, 16)}...` : '(fresh session)'}`);

        liveSession = await ai.live.connect({
          model: modelName,
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: voiceName },
              },
            },
            systemInstruction,
            tools,
            // Enable audio transcriptions with explicit Bengali & Indian English language hinting
            outputAudioTranscription: {
              languageCodes: ["bn-IN", "en-IN", "bn", "en"],
            },
            inputAudioTranscription: {
              languageCodes: ["bn-IN", "en-IN", "bn", "en"],
            },
            // 1. Sliding window context compression prevents 128k token context exhaustion past 5-10 minutes!
            contextWindowCompression: {
              slidingWindow: {},
            },
            // 2. Session resumption preserves continuous conversation state across connection handoffs!
            sessionResumption: effectiveHandle ? { handle: effectiveHandle } : {},
          },
          callbacks: {
            onmessage: (serverMsg: LiveServerMessage) => {
              // 1. Handle session resumption updates from Gemini Live
              if (serverMsg.sessionResumptionUpdate?.newHandle) {
                lastResumptionHandle = serverMsg.sessionResumptionUpdate.newHandle;
                clientWs.send(
                  JSON.stringify({
                    type: "resumption_update",
                    handle: lastResumptionHandle,
                    resumable: serverMsg.sessionResumptionUpdate.resumable,
                  })
                );
              }

              // 2. Handle GoAway warning (issued ~60s before Google rotates the physical WebSocket)
              if (serverMsg.goAway) {
                console.log("[LiveGateway] Gemini Live server issued GoAway warning. Time left:", serverMsg.goAway.timeLeft);
                clientWs.send(
                  JSON.stringify({
                    type: "go_away",
                    timeLeft: serverMsg.goAway.timeLeft,
                  })
                );
                // Proactively trigger seamless reconnect before the connection drops
                setTimeout(() => {
                  if (clientWs.readyState === WebSocket.OPEN && !isReconnecting) {
                    reconnectSession("GoAway cycle handoff");
                  }
                }, 3000);
              }

              // 3. Handle model audio output chunks (24kHz 16-bit PCM little-endian)
              const parts = serverMsg.serverContent?.modelTurn?.parts;
              if (parts && parts.length > 0) {
                for (const part of parts) {
                  if (part.inlineData?.data) {
                    clientWs.send(
                      JSON.stringify({
                        type: "audio",
                        data: part.inlineData.data,
                      })
                    );
                  }
                  if (part.text) {
                    const cleanModelPart = sanitizeBilingualText(part.text);
                    if (cleanModelPart) {
                      clientWs.send(
                        JSON.stringify({
                          type: "model_transcript",
                          text: cleanModelPart,
                        })
                      );
                    }
                  }
                }
              }

              // Model Spoken Audio Transcription (outputAudioTranscription)
              const outputModelText =
                serverMsg.serverContent?.outputTranscription?.text ||
                (serverMsg as any)?.outputTranscription?.text;
              if (outputModelText) {
                const cleanModelText = sanitizeBilingualText(outputModelText);
                if (cleanModelText) {
                  clientWs.send(
                    JSON.stringify({
                      type: "model_transcript",
                      text: cleanModelText,
                    })
                  );
                }
              }

              // 4. Handle user speech transcription from Gemini Live inputAudioTranscription
              const userTranscript =
                serverMsg.serverContent?.inputTranscription?.text ||
                (serverMsg as any)?.inputTranscription?.text ||
                serverMsg.serverContent?.interimInputTranscription?.text ||
                (serverMsg as any)?.interimInputTranscription?.text;
              if (userTranscript) {
                const cleanUserTranscript = sanitizeBilingualText(userTranscript);
                if (cleanUserTranscript) {
                  clientWs.send(
                    JSON.stringify({
                      type: "user_transcript",
                      text: cleanUserTranscript,
                    })
                  );
                }
              }

              // 5. Handle interrupted event
              if (serverMsg.serverContent?.interrupted) {
                clientWs.send(
                  JSON.stringify({
                    type: "interrupted",
                  })
                );
              }

              // 6. Handle turn completion
              if (serverMsg.serverContent?.turnComplete) {
                clientWs.send(
                  JSON.stringify({
                    type: "turn_complete",
                  })
                );
              }

              // 7. Handle function / tool calling
              if (serverMsg.toolCall) {
                const functionCalls = serverMsg.toolCall.functionCalls;
                if (functionCalls && liveSession) {
                  for (const call of functionCalls) {
                    let result: any = {};
                    if (call.name === "get_current_time") {
                      const now = new Date();
                      result = {
                        isoTime: now.toISOString(),
                        localString: now.toLocaleString(),
                        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                      };
                    } else if (call.name === "calculate_expression") {
                      try {
                        const exp = String((call.args as any)?.expression || "0");
                        const sanitized = exp.replace(/[^0-9+\-*/().%\sMath.sqrtsincoabepwl]/g, "");
                        const val = Function(`'use strict'; return (${sanitized});`)();
                        result = { result: val, expression: exp };
                      } catch (e: any) {
                        result = { error: e.message };
                      }
                    }

                    clientWs.send(
                      JSON.stringify({
                        type: "tool_call",
                        id: call.id,
                        name: call.name,
                        args: call.args,
                        result,
                      })
                    );

                    try {
                      liveSession.sendToolResponse({
                        functionResponses: [
                          {
                            id: call.id,
                            name: call.name,
                            response: result,
                          },
                        ],
                      });
                    } catch (err: any) {
                      console.error("Error sending tool response:", err);
                    }
                  }
                }
              }
            },
            onclose: () => {
              isConnected = false;
              // If client is still connected, automatically resume session seamlessly!
              if (clientWs.readyState === WebSocket.OPEN && !isReconnecting) {
                console.log("[LiveGateway] Gemini Live session closed by server. Auto-resuming with handle:", lastResumptionHandle);
                reconnectSession("Session connection renewed");
              } else if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(
                  JSON.stringify({
                    type: "session_timeout",
                    status: "session_timeout",
                    message: "Gemini Live session cycle completed.",
                    handle: lastResumptionHandle,
                  })
                );
              }
            },
            onerror: (err: any) => {
              console.error("[LiveGateway] Gemini Live API error:", err);
              clientWs.send(
                JSON.stringify({
                  type: "error",
                  message: err?.message || "Live API session encountered an error.",
                })
              );
            },
          },
        });

        isConnected = true;
        isReconnecting = false;

        // Flush any pending microphone audio queued during reconnection
        while (pendingAudioQueue.length > 0) {
          const queuedAudio = pendingAudioQueue.shift();
          if (queuedAudio && liveSession) {
            try {
              liveSession.sendRealtimeInput({
                audio: {
                  data: queuedAudio,
                  mimeType: "audio/pcm;rate=16000",
                },
              });
            } catch (e) {}
          }
        }

        // Flush any pending text messages queued during connection
        while (pendingTextQueue.length > 0) {
          const queuedText = pendingTextQueue.shift();
          if (queuedText && liveSession) {
            try {
              liveSession.sendClientContent({
                turns: [
                  {
                    role: "user",
                    parts: [{ text: queuedText }],
                  },
                ],
                turnComplete: true,
              });
            } catch (e) {
              console.error("[LiveGateway] Error sending queued text:", e);
            }
          }
        }

        clientWs.send(
          JSON.stringify({
            type: "status",
            status: "active",
            model: modelName,
            voice: voiceName,
            resumptionHandle: lastResumptionHandle,
            resumed: Boolean(effectiveHandle),
            message: effectiveHandle
              ? "Gemini Live session resumed seamlessly (context preserved)!"
              : "Gemini Live session connected and ready for conversation!",
          })
        );
      } catch (connectErr: any) {
        console.error("[LiveGateway] Live connect error:", connectErr);
        // CRITICAL RESUMPTION FALLBACK: If handle was rejected (expired/invalid 400),
        // fallback seamlessly to fresh session with durable context injection instead of failing!
        if (effectiveHandle && !retryWithoutHandle) {
          console.warn("[LiveGateway] Resumption handle rejected or expired. Seamlessly falling back to fresh session with durable context...");
          lastResumptionHandle = null;
          await establishGeminiSession(null, true);
          return;
        }

        isReconnecting = false;
        clientWs.send(
          JSON.stringify({
            type: "error",
            message: `Failed to connect to Gemini Live: ${connectErr.message}`,
          })
        );
      }
    }

    async function reconnectSession(reason = "auto-renew") {
      if (isReconnecting) {
        console.log(`[LiveGateway] Reconnect already in progress (${reason}), skipping duplicate call.`);
        return;
      }
      isReconnecting = true;
      console.log(`[LiveGateway] Executing seamless Gemini Live session renewal (${reason})...`);
      clientWs.send(
        JSON.stringify({
          type: "status",
          status: "renewing",
          message: "Seamlessly refreshing Gemini connection without losing conversation...",
        })
      );
      await establishGeminiSession(lastResumptionHandle);
    }

    clientWs.send(
      JSON.stringify({
        type: "info",
        message: "Connected to Gemini Live gateway. Ready to initialize session.",
      })
    );

    clientWs.on("message", async (rawMessage) => {
      try {
        const message = JSON.parse(rawMessage.toString());

        if (message.type === "start") {
          const contextSummary = message.contextSummary;
          let sysInstruction = message.systemInstruction ||
            "You are a friendly, highly capable real-time conversational AI. Keep spoken responses clear, lively, concise, and natural.";

          // If a lesson was already ongoing and context summary has active topic, guarantee continuity without subject cross-contamination:
          if (contextSummary && contextSummary.currentTopic && !sysInstruction.includes("DURABLE ONGOING LESSON CONTEXT")) {
            const metaParts = [];
            if (contextSummary.subject) metaParts.push(`Subject="${contextSummary.subject}"`);
            if (contextSummary.classGrade) metaParts.push(`Class="${contextSummary.classGrade}"`);
            if (contextSummary.chapter) metaParts.push(`Chapter="${contextSummary.chapter}"`);
            metaParts.push(`Topic="${contextSummary.currentTopic}"`);
            if (contextSummary.teachingMode) metaParts.push(`TeachingMode="${contextSummary.teachingMode}"`);
            if (contextSummary.lastModelOutput) metaParts.push(`LastExplainedConcept="${contextSummary.lastModelOutput.slice(-150)}"`);
            sysInstruction += `\n\n[DURABLE ONGOING LESSON CONTEXT: ${metaParts.join(', ')}. Strictly teach ONLY this active subject, class, mode, and topic. DO NOT mix any other subject or say any initial greeting. Immediately resume continuous teaching of this topic.]`;
          }

          // Strict Bilingual Directive: Guarantee student speech is recognized exclusively as Bengali or English
          if (!sysInstruction.includes("STRICT BILINGUAL ONLY DIRECTIVE")) {
            sysInstruction += `\n\n[STRICT BILINGUAL ONLY DIRECTIVE (STUDENT SPEECH RECOGNITION & UNDERSTANDING):
- The student speaks EXCLUSIVELY in Bengali (বাংলা), English, or mixed Bengali-English ('Benglish' / বাংলা-ইংরেজি মিশ্রণ / code-switching).
- The student NEVER speaks German, Hindi (Devanagari), French, Korean, Japanese, Chinese, Russian, Spanish, Arabic, or any other foreign language!
- CRITICAL AUDIO HALLUCINATION & PHONETIC RECOGNITION RULES:
  1. If background room noise, mic hiss, breathing, or Indian/Bengali accent is captured, NEVER transcribe, interpret, or guess words in German (e.g. 'Blihartzahnarzt', 'Zahnarzt', 'Ja da haben Sie'), Hindi Devanagari (e.g. 'ब्रह्मास्त्र'), French ('oui', 'merci'), or Korean!
  2. ALWAYS map acoustic speech to the active educational subject terms in Bengali or English.
     Example in Indian History (সিন্ধু সভ্যতা): if student says 'লোথাল' (Lothal), NEVER mishear it as 'notar' or foreign gibberish. Recognize it as 'লোথাল' (Lothal). Match student answers against expected chapter concepts (e.g. রাখালদাস বন্দ্যোপাধ্যায়, দয়ারাম সাহানী, মহেঞ্জোদাড়ো, হরপ্পা, লোথাল, কালিবঙ্গান, বৃহৎ স্নানাগার, ব্রোঞ্জ, তামা, সিন্ধু নদ).
  3. Be forgiving of acoustic microphone imperfections — if the student's Bengali or English response is phonetically close to the correct concept, validate their answer immediately and proceed smoothly!
  4. NEVER repeat a question that was already asked earlier in the session. Always move forward to a new question or concept in the chapter.
  5. All your explanations, teaching, feedback, and transcriptions MUST strictly be in Bengali (বাংলা) and/or English.]`;
          }

          sessionParams = {
            modelName: message.model || "gemini-3.8-live",
            voiceName: message.voice || "Kore",
            systemInstruction: sysInstruction,
            contextSummary,
          };

          const resumeHandle = message.resumeHandle || message.resumptionHandle || null;

          clientWs.send(
            JSON.stringify({
              type: "status",
              status: "connecting",
              message: resumeHandle
                ? `Resuming Gemini Live session with voice '${sessionParams.voiceName}'...`
                : `Connecting to ${sessionParams.modelName} with voice '${sessionParams.voiceName}'...`,
            })
          );

          await establishGeminiSession(resumeHandle);
          return;
        }

        // Realtime audio streaming from client (16kHz PCM little-endian)
        if (message.type === "audio" && message.data) {
          if (liveSession && isConnected) {
            try {
              liveSession.sendRealtimeInput({
                audio: {
                  data: message.data,
                  mimeType: "audio/pcm;rate=16000",
                },
              });
            } catch (sendErr) {
              console.error("Error sending realtime input:", sendErr);
            }
          } else if (isReconnecting) {
            // Buffer up to 25 chunks (~6 seconds) during connection handoff so user words are never lost
            if (pendingAudioQueue.length < 25) {
              pendingAudioQueue.push(message.data);
            }
          }
          return;
        }

        // Turn completion notification from client VAD (informational only)
        // Note: Real-time audio streams manage turns automatically via Gemini server VAD.
        // DO NOT send empty sendClientContent({ turnComplete: true }) which causes live session disconnects!
        if (message.type === "speech_ended" || message.type === "turn_complete") {
          return;
        }

        // Realtime video / screen frame streaming (JPEG <= 1 FPS)
        if (message.type === "video" && message.data) {
          if (liveSession && isConnected) {
            liveSession.sendRealtimeInput({
              video: {
                data: message.data,
                mimeType: "image/jpeg",
              },
            });
          }
          return;
        }

        // Direct text input injected into live conversation (acts like speech)
        if (message.type === "text" && message.text) {
          if (liveSession && isConnected) {
            try {
              liveSession.sendClientContent({
                turns: [
                  {
                    role: "user",
                    parts: [{ text: message.text }],
                  },
                ],
                turnComplete: true,
              });
            } catch (err: any) {
              console.error("[LiveGateway] Failed to send client text content:", err);
              clientWs.send(
                JSON.stringify({
                  type: "error",
                  message: `AI-তে মেসেজ পৌঁছায়নি: ${err?.message || "Error"}. আবার চেষ্টা করুন।`,
                })
              );
            }
          } else {
            console.log("[LiveGateway] Queuing text message until session connects:", message.text);
            pendingTextQueue.push(message.text);
            clientWs.send(
              JSON.stringify({
                type: "status",
                status: "connecting",
                message: "সংযোগ তৈরি হচ্ছে, এক মুহূর্তেই AI উত্তর দেবে...",
              })
            );
          }
          return;
        }

        // End / close session
        if (message.type === "stop") {
          if (liveSession) {
            try {
              liveSession.close();
            } catch (e) {}
            liveSession = null;
          }
          isConnected = false;
          clientWs.send(
            JSON.stringify({
              type: "status",
              status: "idle",
              message: "Session ended.",
            })
          );
        }
      } catch (err: any) {
        console.error("WebSocket message handling error:", err);
      }
    });

    clientWs.on("close", () => {
      clearInterval(heartbeatInterval);
      if (liveSession) {
        try {
          liveSession.close();
        } catch (e) {}
        liveSession = null;
      }
      isConnected = false;
    });
  });
}
