import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { apiRequest, apiRequestCached, apiStreamRequest, getFromCache, invalidateCache } from '../api/client';
import { TypewriterMessage } from '../components/chat/TypewriterMessage';
import { interruptButtonStyles, CHIP_SUGGESTIONS } from '../utils/markdownCards';
import {
  calculateTextareaHeight,
  shouldSubmitOnEnter,
  getUploadButtonClass,
  getSuggestionChipsContainerClass,
  handleModalBackdropClick,
} from '../utils/theme';
import { useTypewriterPlaceholder } from '../hooks/useTypewriterPlaceholder';
import {
  Send,
  Plus,
  Camera,
  Image as ImageIcon,
  X,
  CheckSquare,
  Loader2,
  ArrowRight,
  AlertCircle,
} from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  tool_calls?: any[];
  animate?: boolean;
}

const PLACEHOLDER_PHRASES = [
  'Ask a doubt...',
  'Request a quiz topic...',
  'Review missed questions...',
];

export const InstructorPage: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [showUploadSheet, setShowUploadSheet] = useState(false);
  const [isClosingSheet, setIsClosingSheet] = useState(false);
  const [agentSteps, setAgentSteps] = useState<Array<{ phase: string; text: string; tool?: string }>>([]);

  const animatedPlaceholder = useTypewriterPlaceholder(PLACEHOLDER_PHRASES, 50, 25, 2000);

  const [searchParams, setSearchParams] = useSearchParams();
  const sessionId = searchParams.get('session');

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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

  const adjustTextareaHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const minLines = 1;
    const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768;
    const maxLines = isDesktop ? 7 : 4;
    const { height, overflowY } = calculateTextareaHeight(el.scrollHeight, 24, minLines, maxLines);
    el.style.height = `${height}px`;
    el.style.overflowY = overflowY;
  }, [messages.length]);

  useEffect(() => {
    adjustTextareaHeight();
  }, [input, adjustTextareaHeight]);

  const handleOpenUploadSheet = () => {
    setIsClosingSheet(false);
    setShowUploadSheet(true);
  };

  const handleCloseUploadSheet = () => {
    setIsClosingSheet(true);
    setTimeout(() => {
      setShowUploadSheet(false);
      setIsClosingSheet(false);
    }, 250);
  };

  useEffect(() => {
    if (!sessionId || sessionId === 'new') {
      setMessages([]);
      return;
    }

    const endpoint = `/api/instructor/sessions/${sessionId}/messages`;

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
          setMessages([]);
        }
      })
      .catch(() => {
        setMessages([]);
      });
  }, [sessionId]);

  // Handle incoming preloaded prompt (e.g. from Edit with AI in Quiz Arena or Tutor with AI in Analytics)
  useEffect(() => {
    const promptParam = searchParams.get('prompt');
    if (promptParam) {
      setInput(promptParam);
      setTimeout(() => {
        textareaRef.current?.focus();
        adjustTextareaHeight();
      }, 50);
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('prompt');
      setSearchParams(nextParams, { replace: true });
    }
  }, [searchParams, setSearchParams, adjustTextareaHeight]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Close upload sheet on Escape key press with smooth slide-down
  useEffect(() => {
    if (!showUploadSheet) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCloseUploadSheet();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showUploadSheet]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
    if (shouldSubmitOnEnter(e, isMobile)) {
      e.preventDefault();
      handleSendMessage();
    }
  };

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
    handleCloseUploadSheet();
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
        setTimeout(() => {
          textareaRef.current?.focus();
          adjustTextareaHeight();
        }, 50);
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

      {/* Case 1: Centered Hero Layout on New/Empty Chat */}
      {messages.length === 0 && !loading ? (
        <div className="flex-1 flex flex-col items-center justify-center p-4 max-w-2xl mx-auto w-full text-center space-y-6 animate-in fade-in duration-300">
          <div className="space-y-3 flex flex-col items-center">
            <img
              src="/logo.png"
              alt="Pragati Logo"
              className="w-12 h-12 rounded-2xl object-cover border border-slate-200 shadow-xs mb-1"
            />
            <h2 className="text-2xl sm:text-3xl font-display font-extrabold text-slate-900 tracking-tight">
              What would you like to learn today?
            </h2>
          </div>

          {/* Centered Input Form with vertical center alignment */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="w-full flex items-center gap-1.5 sm:gap-2 p-2 bg-white border border-slate-200 rounded-2xl shadow-lg transition-all focus-within:border-slate-400 focus-within:ring-2 focus-within:ring-slate-900/5 text-left"
          >
            {/* Borderless Plus Button */}
            <button
              type="button"
              disabled={ocrLoading || loading}
              onClick={handleOpenUploadSheet}
              title="Upload Problem (Camera or Gallery)"
              className={getUploadButtonClass()}
            >
              {ocrLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-slate-700" />
              ) : (
                <Plus className="w-5 h-5" />
              )}
            </button>

            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                adjustTextareaHeight();
              }}
              onKeyDown={handleKeyDown}
              placeholder={animatedPlaceholder}
              disabled={loading}
              className="flex-1 px-2 sm:px-3 py-1 bg-white text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none resize-none transition disabled:bg-transparent disabled:text-slate-500 leading-normal max-h-32 sm:max-h-48 subtle-scroll"
            />

            <button
              type="submit"
              disabled={!input.trim()}
              title="Send Message"
              aria-label="Send Message"
              className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-xl bg-slate-900 hover:bg-slate-800 text-white shadow-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] cursor-pointer"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>

          {/* Centered Suggestion Chips without scrollbar */}
          <div className={getSuggestionChipsContainerClass()}>
            {CHIP_SUGGESTIONS.map((chip, idx) => (
              <button
                key={idx}
                type="button"
                disabled={loading}
                onClick={() => {
                  setInput(chip.prompt);
                  setTimeout(() => {
                    textareaRef.current?.focus();
                    adjustTextareaHeight();
                  }, 20);
                }}
                className="text-xs font-medium px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 transition-colors shadow-xs whitespace-nowrap flex-shrink-0 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        /* Case 2: Conversation Message Feed & Floating Bottom Dock */
        <>
          {/* Scrollable Message Feed - pb-40 allows messages to scroll behind floating dock, pt-16 provides mobile clearance below floating buttons */}
          <div className="flex-1 overflow-y-auto subtle-scroll px-3 sm:px-4 md:px-6 pt-16 sm:pt-4 pb-40 space-y-4">
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
                          : 'bg-white text-slate-900 rounded-tl-none shadow-xs'
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

                        if (parsedResult && (parsedResult.action === 'ERROR' || parsedResult.error)) {
                          return (
                            <div
                              key={tcIdx}
                              className="bg-rose-50/80 border border-rose-200 p-4 rounded-2xl max-w-md animate-in fade-in duration-200 text-xs text-rose-900 space-y-2 shadow-xs"
                            >
                              <div className="flex items-center gap-2 font-display font-semibold text-rose-800">
                                <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                                <span>Quiz Generation Notice</span>
                              </div>
                              <p className="text-rose-700 leading-relaxed font-sans">
                                {parsedResult.error || 'Failed to complete quiz generation.'}
                              </p>
                              <button
                                type="button"
                                onClick={() => {
                                  setInput('generate a quiz to test my understanding on topic : ');
                                  setTimeout(() => {
                                    textareaRef.current?.focus();
                                    adjustTextareaHeight();
                                  }, 20);
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-rose-300 text-rose-700 hover:bg-rose-100/60 rounded-xl font-medium transition cursor-pointer shadow-xs"
                              >
                                <span>Retry Prompt</span>
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

            {/* Live Step-by-Step Grey Agent Telemetry & Prominent Quiz Generation Card */}
            {loading && (
              <div className="w-full flex flex-col items-start gap-2.5 py-1">
                {agentSteps.some(
                  (s) => s.tool === 'generate_quiz' || s.text.toLowerCase().includes('generate_quiz')
                ) && (
                  <div className="bg-white border border-slate-300 p-4 rounded-2xl shadow-xs max-w-md w-full animate-in fade-in duration-200 space-y-2">
                    <div className="flex items-center gap-2.5">
                      <Loader2 className="w-4 h-4 animate-spin text-slate-800" />
                      <span className="text-xs font-display font-bold text-slate-900 tracking-tight">
                        Generating Assessment...
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed font-sans">
                      Crafting curriculum questions, conceptual hints, and step-by-step rationales. Input is paused while your quiz is being created.
                    </p>
                  </div>
                )}

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
          <div className="absolute bottom-2 left-2 right-2 sm:bottom-4 sm:left-4 sm:right-4 max-w-4xl mx-auto pointer-events-none z-20 flex flex-col gap-1.5 sm:gap-2">
            {/* Floating Suggestions Chips directly above prompt with no-scrollbar */}
            <div className={getSuggestionChipsContainerClass()}>
              {CHIP_SUGGESTIONS.map((chip, idx) => (
                <button
                  key={idx}
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setInput(chip.prompt);
                    setTimeout(() => {
                      textareaRef.current?.focus();
                      adjustTextareaHeight();
                    }, 20);
                  }}
                  className="text-xs font-medium px-2.5 sm:px-3 py-1.5 rounded-xl bg-white/95 backdrop-blur-xs border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 transition-colors shadow-xs whitespace-nowrap flex-shrink-0 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {/* Floating Opaque Prompt Input Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="pointer-events-auto flex items-center gap-1.5 sm:gap-2 p-1.5 bg-white border border-slate-200 rounded-2xl shadow-lg transition-all focus-within:border-slate-400 focus-within:ring-2 focus-within:ring-slate-900/5"
            >
              {/* Borderless Plus button */}
              <button
                type="button"
                disabled={ocrLoading || loading}
                onClick={handleOpenUploadSheet}
                title="Upload Problem (Camera or Gallery)"
                className={getUploadButtonClass()}
              >
                {ocrLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-slate-700" />
                ) : (
                  <Plus className="w-5 h-5" />
                )}
              </button>

              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  adjustTextareaHeight();
                }}
                onKeyDown={handleKeyDown}
                placeholder={loading ? "AI Instructor is thinking..." : animatedPlaceholder}
                disabled={loading}
                className="flex-1 px-2 sm:px-3 py-1 bg-white text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none resize-none transition disabled:bg-transparent disabled:text-slate-500 leading-normal max-h-32 sm:max-h-48 subtle-scroll"
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
        </>
      )}

      {/* Bottom Action Sheet for Camera / Gallery with smooth slide-up & slide-down */}
      {showUploadSheet &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className={`fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-end justify-center sm:items-center p-0 sm:p-4 transition-opacity duration-250 cursor-pointer ${
              isClosingSheet ? 'opacity-0' : 'opacity-100 animate-in fade-in duration-200'
            }`}
            onClick={(e) => handleModalBackdropClick(e, handleCloseUploadSheet)}
          >
            <div
              className={`w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl border border-slate-200/90 cursor-default transition-all duration-250 ${
                isClosingSheet
                  ? 'translate-y-full sm:translate-y-4 sm:opacity-0'
                  : 'translate-y-0 sm:translate-y-0 sm:opacity-100 animate-in slide-in-from-bottom-6 duration-250'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-display font-bold text-slate-900">Upload Problem Snapshot</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Choose capture method for Socratic AI problem solving</p>
                </div>
                <button
                  type="button"
                  onClick={handleCloseUploadSheet}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                {/* Option 1: Camera */}
                <button
                  type="button"
                  onClick={() => {
                    handleCloseUploadSheet();
                    cameraInputRef.current?.click();
                  }}
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
                  onClick={() => {
                    handleCloseUploadSheet();
                    galleryInputRef.current?.click();
                  }}
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
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
