import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { apiRequest, apiRequestCached, apiStreamRequest, getFromCache, invalidateCache } from '../api/client';
import { TypewriterMessage } from '../components/chat/TypewriterMessage';
import { interruptButtonStyles } from '../utils/markdownCards';
import {
  Bot,
  Send,
  Plus,
  Camera,
  Image as ImageIcon,
  X,
  CheckSquare,
  Loader2,
  ArrowRight,
} from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  tool_calls?: any[];
  animate?: boolean;
}

const WELCOME_MESSAGE: Message = {
  role: 'assistant',
  content:
    'Hello! I am your Socratic AI Instructor. Ask me any conceptual question in STEM, upload a snapshot of a difficult problem, or ask me to generate a personalized practice quiz on any topic!',
  animate: false,
};

export const InstructorPage: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [showUploadSheet, setShowUploadSheet] = useState(false);
  const [agentSteps, setAgentSteps] = useState<Array<{ phase: string; text: string; tool?: string }>>([]);

  const [searchParams, setSearchParams] = useSearchParams();
  const sessionId = searchParams.get('session');

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const navigate = useNavigate();

  const handleInterrupt = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setLoading(false);
    setAgentSteps([]);
    setMessages((prev) => [
      ...prev,
      {
        role: 'assistant',
        content: '*(Response stopped by user)*',
        animate: false,
      },
    ]);
  };

  useEffect(() => {
    if (sessionId === 'new') {
      setMessages([WELCOME_MESSAGE]);
      return;
    }

    const endpoint = sessionId
      ? `/api/instructor/sessions/${sessionId}/messages`
      : '/api/instructor/history';

    // Check synchronous cache first to eliminate loading flash
    const cached = getFromCache<{ messages: Message[]; sessionId?: string }>(endpoint);
    if (cached && cached.messages && cached.messages.length > 0) {
      setMessages(cached.messages.map((m) => ({ ...m, animate: false })));
      return;
    }

    apiRequestCached<{ messages: Message[]; sessionId?: string }>(endpoint)
      .then((data) => {
        if (data.messages && data.messages.length > 0) {
          setMessages(
            data.messages.map((m) => ({
              ...m,
              animate: false,
            }))
          );
        } else {
          setMessages([WELCOME_MESSAGE]);
        }
      })
      .catch(() => {
        setMessages([WELCOME_MESSAGE]);
      });
  }, [sessionId]);

  // Handle incoming preloaded prompt (e.g. from Edit with AI in Quiz Arena)
  useEffect(() => {
    const promptParam = searchParams.get('prompt');
    if (promptParam) {
      setInput(promptParam);
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('prompt');
      setSearchParams(nextParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSendMessage = async (textToSend?: string) => {
    const messageContent = textToSend || input;
    if (!messageContent.trim() || loading) return;

    // Send history of previous turns (before adding current message) to prevent duplicate messages
    const historyPayload = messages.slice(-8);

    const newMessages: Message[] = [
      ...messages,
      { role: 'user', content: messageContent, animate: false },
    ];
    setMessages(newMessages);
    if (!textToSend) setInput('');
    setLoading(true);
    setAgentSteps([]);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const activeSessionId = sessionId && sessionId !== 'new' ? sessionId : undefined;
      const data = await apiStreamRequest(
        '/api/instructor/chat',
        {
          method: 'POST',
          signal: controller.signal,
          body: JSON.stringify({
            message: messageContent,
            history: historyPayload,
            sessionId: activeSessionId,
          }),
        },
        (event) => {
          if (event.type === 'step') {
            setAgentSteps((prev) => {
              if (prev.length > 0 && prev[prev.length - 1].text === event.text) {
                return prev;
              }
              return [...prev, { phase: event.phase, text: event.text, tool: event.tool }];
            });
          }
        }
      );

      // Invalidate cache for instructor sessions and history
      invalidateCache('/api/instructor');
      window.dispatchEvent(new Event('chat_sessions_updated'));

      if (data?.sessionId && (!sessionId || sessionId === 'new')) {
        setSearchParams({ session: data.sessionId });
      }

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data?.reply || 'I processed your request.',
          tool_calls: data?.toolExecutions,
          animate: true,
        },
      ]);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // Interrupted by user; already handled in handleInterrupt
        return;
      }
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Sorry, I encountered an issue: ${err.message}. Please check your connection or try again.`,
          animate: false,
        },
      ]);
    } finally {
      setLoading(false);
      setAgentSteps([]);
      abortControllerRef.current = null;
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    e.target.value = '';
    setShowUploadSheet(false);
    setOcrLoading(true);

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      try {
        const data = await apiRequest<{ extractedText: string }>('/api/instructor/ocr', {
          method: 'POST',
          body: JSON.stringify({ imageBase64: base64 }),
        });

        setInput(`Here is the question from my upload: "${data.extractedText}". Can you guide me through solving it step-by-step?`);
      } catch (err: any) {
        alert(`OCR extraction failed: ${err.message}`);
      } finally {
        setOcrLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="relative flex flex-col h-full max-w-5xl mx-auto w-full font-sans overflow-hidden">
      {/* Hidden File Inputs for Camera and Gallery */}
      <input
        type="file"
        ref={cameraInputRef}
        onChange={handleImageUpload}
        accept="image/*"
        capture="environment"
        className="hidden"
      />
      <input
        type="file"
        ref={galleryInputRef}
        onChange={handleImageUpload}
        accept="image/*"
        className="hidden"
      />

      {/* Scrollable Message Feed with Header inside - pb-36 allows messages to scroll behind floating dock */}
      <div className="flex-1 overflow-y-auto subtle-scroll px-4 md:px-6 pt-4 pb-36 space-y-4">
        {/* Header - scrollable along with chat messages */}
        <div className="flex items-center gap-3 pb-4 mb-2 border-b border-slate-200">
          <div className="w-10 h-10 rounded-xl bg-white text-slate-800 flex items-center justify-center border border-slate-200 shadow-xs">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-display font-extrabold text-slate-900 tracking-tight">AI Instructor</h2>
            <p className="text-xs text-slate-500 font-medium">
              Socratic tutor powered by Bedrock Mantle DeepSeek
            </p>
          </div>
        </div>

        {/* Chat Messages Feed */}
        {messages.map((msg, idx) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={idx}
              className={`w-full flex ${isUser ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-2xl flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-3`}>
                <div
                  className={`p-4 rounded-2xl text-sm leading-relaxed ${
                    isUser
                      ? 'bg-slate-900 text-white rounded-tr-none shadow-xs'
                      : 'bg-white text-slate-900 rounded-tl-none border border-slate-200 shadow-xs'
                  }`}
                >
                  {isUser ? (
                    <div className="prose prose-sm max-w-none text-white">
                      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <TypewriterMessage
                      content={msg.content}
                      animate={msg.animate}
                      speedMs={12}
                      onUpdate={() => chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })}
                    />
                  )}
                </div>

                {/* Render In-Chat Interactive Quiz Card if tool was executed */}
                {msg.tool_calls &&
                  msg.tool_calls.map((tc, tcIdx) => {
                    let parsedResult: any = null;
                    try {
                      parsedResult = typeof tc.result === 'string' ? JSON.parse(tc.result) : tc.result;
                    } catch {}

                    if (parsedResult && parsedResult.action === 'QUIZ_GENERATED') {
                      return (
                        <div
                          key={tcIdx}
                          className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs max-w-md animate-in fade-in duration-300"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-bold text-slate-800 uppercase tracking-wider bg-white px-2.5 py-0.5 rounded-full border border-slate-200 font-display">
                              Quiz Generated
                            </span>
                            <span className="text-xs font-semibold text-slate-500 capitalize">
                              {parsedResult.difficulty} Difficulty
                            </span>
                          </div>
                          <h4 className="text-sm font-display font-bold text-slate-900">{parsedResult.topic}</h4>
                          <p className="text-xs text-slate-600 mt-1">
                            Assessment with {parsedResult.total_questions} questions and granular dwell time tracking.
                          </p>
                          <button
                            onClick={() => navigate(`/quizzes/${parsedResult.quiz_id}`)}
                            className="mt-3 w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors shadow-xs font-display"
                          >
                            <CheckSquare className="w-3.5 h-3.5" />
                            <span>Start Quiz Now</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    }
                    return null;
                  })}
              </div>
            </div>
          );
        })}

        {/* Live Step-by-Step Grey Agent Telemetry - displayed outside of message grids */}
        {loading && (
          <div className="w-full flex justify-start py-1">
            <div className="space-y-1.5 py-1 px-1">
              {agentSteps.length > 0 ? (
                agentSteps.map((step, sIdx) => {
                  const isLatest = sIdx === agentSteps.length - 1;
                  return (
                    <div
                      key={sIdx}
                      className="flex items-center gap-2 text-xs font-mono text-slate-500 animate-in fade-in duration-150"
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isLatest ? 'bg-slate-600 animate-ping' : 'bg-slate-300'
                        }`}
                      />
                      <span className={isLatest ? 'text-slate-700 font-semibold' : 'text-slate-400'}>
                        {step.text}
                      </span>
                    </div>
                  );
                })
              ) : (
                <div className="flex items-center gap-2 text-xs font-mono text-slate-500 animate-in fade-in duration-150">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-pulse" />
                  <span>Thinking...</span>
                </div>
              )}
            </div>
          </div>
        )}
        <div ref={chatBottomRef} />
      </div>

      {/* Floating Prompt & Suggestions Dock - Pinned consistently regardless of scroll */}
      <div className="absolute bottom-4 left-4 right-4 max-w-4xl mx-auto pointer-events-none z-20 flex flex-col gap-2">
        {/* Floating Suggestions Chips directly above prompt (no 'SUGGESTIONS:' text label) */}
        <div className="pointer-events-auto flex items-center gap-2 overflow-x-auto subtle-scroll py-1 px-0.5">
          <button
            type="button"
            disabled={loading}
            onClick={() => handleSendMessage("Generate a 3-question quiz on Calculus Derivatives")}
            className="text-xs font-medium px-3 py-1.5 rounded-xl bg-white/95 backdrop-blur-xs border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 transition-colors shadow-xs whitespace-nowrap flex-shrink-0 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Create Calculus Quiz
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => handleSendMessage("What questions did I get wrong in my recent quiz and how can I fix them?")}
            className="text-xs font-medium px-3 py-1.5 rounded-xl bg-white/95 backdrop-blur-xs border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 transition-colors shadow-xs whitespace-nowrap flex-shrink-0 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Review Missed Questions
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => handleSendMessage("Explain the underlying concepts and intuition behind the last topic")}
            className="text-xs font-medium px-3 py-1.5 rounded-xl bg-white/95 backdrop-blur-xs border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 transition-colors shadow-xs whitespace-nowrap flex-shrink-0 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Explain Concept
          </button>
        </div>

        {/* Floating Opaque Prompt Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="pointer-events-auto flex items-center gap-2 p-1.5 bg-white border border-slate-200 rounded-2xl shadow-lg transition-all focus-within:border-slate-400"
        >
          {/* Plus button to open Camera / Gallery Action Sheet */}
          <button
            type="button"
            disabled={ocrLoading || loading}
            onClick={() => setShowUploadSheet(true)}
            title="Upload Problem (Camera or Gallery)"
            className="w-10 h-10 flex-shrink-0 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 text-slate-600 hover:text-slate-900 transition-colors shadow-xs flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {ocrLoading ? (
              <Loader2 className="w-4 h-4 animate-spin text-slate-700" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
          </button>

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={loading ? "AI Instructor is thinking..." : "Ask a doubt, request a quiz topic, or ask to review missed questions..."}
            disabled={loading}
            className="flex-1 px-3 py-2 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none transition disabled:bg-transparent disabled:text-slate-500"
          />

          {/* Dynamic Action Button: Interrupt Button when running, Send Button when idle */}
          {loading ? (
            <button
              type="button"
              onClick={handleInterrupt}
              title="Stop generation"
              aria-label="Stop generation"
              className={interruptButtonStyles.container}
            >
              <span className={interruptButtonStyles.square} />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              title="Send Message"
              aria-label="Send Message"
              className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-xl bg-slate-900 hover:bg-slate-800 text-white shadow-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] cursor-pointer"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </form>
      </div>

      {/* Bottom Action Sheet for Camera / Gallery rendered via Portal */}
      {showUploadSheet &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-end justify-center sm:items-center p-0 sm:p-4 animate-in fade-in duration-150"
            onClick={() => setShowUploadSheet(false)}
          >
            <div
              className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl border border-slate-200/90 animate-in slide-in-from-bottom-4 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-display font-bold text-slate-900">Upload Problem Snapshot</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Choose capture method for Socratic AI problem solving</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowUploadSheet(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                {/* Option 1: Camera */}
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all text-left group cursor-pointer"
                >
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-800 group-hover:bg-slate-900 group-hover:text-white flex items-center justify-center transition-colors shadow-xs">
                    <Camera className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-display font-bold text-slate-900 group-hover:text-slate-900 transition-colors">
                      Take Photo with Camera
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">Snap a textbook or handwritten formula</p>
                  </div>
                </button>

                {/* Option 2: Gallery / Files */}
                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all text-left group cursor-pointer"
                >
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-800 group-hover:bg-slate-900 group-hover:text-white flex items-center justify-center transition-colors shadow-xs">
                    <ImageIcon className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-display font-bold text-slate-900 group-hover:text-slate-900 transition-colors">
                      Photo Gallery / Files
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">Select a screenshot or photo from device</p>
                  </div>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowUploadSheet(false)}
                className="mt-4 w-full py-2.5 text-xs font-semibold text-slate-500 hover:text-slate-800 rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
