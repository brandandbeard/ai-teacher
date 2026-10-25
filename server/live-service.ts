import { FunctionDeclaration, GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";
import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage, ServerResponse } from "http";
import dotenv from "dotenv";

dotenv.config();

function getApiKey(): string {
  return process.env.GEMINI_API_KEY || "";
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
    middlewareApp.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

      if (req.method === "OPTIONS") {
        res.statusCode = 204;
        res.end();
        return;
      }

      const url = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);

      if (url.pathname === "/api/health") {
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 200;
        res.end(
          JSON.stringify({
            status: "ok",
            hasApiKey: Boolean(getApiKey()),
            models: [
              "gemini-3.8-live",
              "gemini-3.8-live-extended-thinking",
              "gemini-3.5-transcribe-live"
            ],
            voices: ["Zephyr", "Puck", "Charon", "Kore", "Fenrir"],
          })
        );
        return;
      }

      if (url.pathname === "/api/gemini/voice-preview" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });
        req.on("end", async () => {
          try {
            const { voice = "Zephyr", text = "Hello! I am ready for our Gemini Live conversation." } =
              JSON.parse(body || "{}");
            const apiKey = getApiKey();
            if (!apiKey) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "GEMINI_API_KEY is not configured" }));
              return;
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
            res.setHeader("Content-Type", "application/json");
            res.statusCode = 200;
            res.end(JSON.stringify({ audioWavBase64: base64Audio, voice }));
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: err.message || "Failed to generate preview" }));
          }
        });
        return;
      }

      next();
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
    } = {
      modelName: "gemini-3.8-live",
      voiceName: "Kore",
      systemInstruction: "You are a friendly, highly capable real-time conversational AI. Keep spoken responses clear, lively, concise, and natural.",
    };

    // Audio buffer to queue client speech during brief server reconnection transitions (~200ms)
    const pendingAudioQueue: string[] = [];

    // Heartbeat keep-alive every 10s to prevent proxy/Cloud Run idle timeouts
    const heartbeatInterval = setInterval(() => {
      if (clientWs.readyState === WebSocket.OPEN) {
        try {
          clientWs.ping();
          clientWs.send(JSON.stringify({ type: "heartbeat", timestamp: Date.now() }));
        } catch (e) {}
      }
    }, 10000);

    // Helper to connect or reconnect to Gemini Live API
    async function establishGeminiSession(resumeHandle?: string | null) {
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

      try {
        if (liveSession) {
          try {
            liveSession.close();
          } catch (e) {}
          liveSession = null;
        }

        const effectiveHandle = resumeHandle || lastResumptionHandle || undefined;

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
            // Enable audio transcriptions
            outputAudioTranscription: {},
            inputAudioTranscription: {},
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
                console.log("Gemini Live server issued GoAway warning. Time left:", serverMsg.goAway.timeLeft);
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
                    clientWs.send(
                      JSON.stringify({
                        type: "model_transcript",
                        text: part.text,
                      })
                    );
                  }
                }
              }

              // 4. Handle interrupted event
              if (serverMsg.serverContent?.interrupted) {
                clientWs.send(
                  JSON.stringify({
                    type: "interrupted",
                  })
                );
              }

              // 5. Handle turn completion
              if (serverMsg.serverContent?.turnComplete) {
                clientWs.send(
                  JSON.stringify({
                    type: "turn_complete",
                  })
                );
              }

              // 6. Handle function / tool calling
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
                console.log("Gemini Live session closed by server. Auto-resuming with handle:", lastResumptionHandle);
                reconnectSession("Session connection renewed");
              } else {
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
              console.error("Gemini Live API error:", err);
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

        clientWs.send(
          JSON.stringify({
            type: "status",
            status: "active",
            model: modelName,
            voice: voiceName,
            resumptionHandle: lastResumptionHandle,
            message: effectiveHandle
              ? "Gemini Live session resumed seamlessly (context preserved)!"
              : "Gemini Live session connected and ready for conversation!",
          })
        );
      } catch (connectErr: any) {
        console.error("Live connect error:", connectErr);
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
      if (isReconnecting) return;
      isReconnecting = true;
      console.log(`Executing seamless Gemini Live session renewal (${reason})...`);
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
          sessionParams = {
            modelName: message.model || "gemini-3.8-live",
            voiceName: message.voice || "Kore",
            systemInstruction:
              message.systemInstruction ||
              "You are a friendly, highly capable real-time conversational AI. Keep spoken responses clear, lively, concise, and natural.",
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

        // Explicit turn completion from client VAD (fires after 1.25s silence)
        if (message.type === "speech_ended" || message.type === "turn_complete") {
          if (liveSession && isConnected) {
            try {
              liveSession.sendClientContent({
                turnComplete: true,
              });
            } catch (err) {
              // Silently handle if turn was already concluded by audio stream
            }
          }
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

        // Direct text input injected into live conversation
        if (message.type === "text" && message.text) {
          if (liveSession && isConnected) {
            liveSession.sendClientContent({
              turns: [
                {
                  role: "user",
                  parts: [{ text: message.text }],
                },
              ],
              turnComplete: true,
            });
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
