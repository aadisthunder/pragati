import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { apiRequestCached, apiStreamRequest, getFromCache, invalidateCache } from '../api/client';
import { TypewriterMessage } from '../components/chat/TypewriterMessage';
import { interruptButtonStyles, CHIP_SUGGESTIONS } from '../utils/markdownCards';
import {
  calculateTextareaHeight,
  shouldSubmitOnEnter,
  getUploadButtonClass,
  getSuggestionChipsContainerClass,
  getHeroSuggestionChipsContainerClass,
  handleModalBackdropClick,
} from '../utils/theme';
import { compressImageFile } from '../utils/imageCompressor';
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

export interface AttachedImage {
  base64: string;
  fileName: string;
  fileSize: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  image?: string;
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
  const [attachedImage, setAttachedImage] = useState<AttachedImage | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
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
    }, 300);
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
    const rawContent = textToSend !== undefined ? textToSend : input;
    const hasImage = attachedImage !== null && Boolean(attachedImage.base64);

    if ((!rawContent.trim() && !hasImage) || loading) return;

    const messageContent = rawContent.trim()
      ? rawContent.trim()
      : 'Please analyze this problem and guide me step-by-step through solving it Socratically.';

    const imagePayload = attachedImage?.base64;

    // Send clean history of previous turns (strictly role & content, stripping UI fields like animate/image)
    const historyPayload = messages
      .slice(-10)
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .map((m) => ({ role: m.role, content: m.content.trim() }));

    const newMessages: Message[] = [
      ...messages,
      { role: 'user', content: messageContent, image: imagePayload, animate: false },
    ];
    setMessages(newMessages);

    // Instant clear of input and attached image for responsive feedback
    if (!textToSend) setInput('');
    setAttachedImage(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

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
            imageBase64: imagePayload,
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

    try {
      // Downscale high-resolution camera photos (e.g. 15MB -> ~350KB) before attachment
      const compressedBase64 = await compressImageFile(file, 1600, 0.82);
      const formattedSize =
        file.size > 1024 * 1024
          ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
          : `${Math.max(1, Math.round(file.size / 1024))} KB`;

      setAttachedImage({
        base64: compressedBase64,
        fileName: file.name || 'Problem_Photo.jpg',
        fileSize: formattedSize,
      });

      setTimeout(() => {
        textareaRef.current?.focus();
        adjustTextareaHeight();
      }, 50);
    } catch (err: any) {
      alert(`Image processing note: ${err.message || 'Failed to process image'}`);
    } finally {
      setOcrLoading(false);
    }
  };

  const handleRemoveAttachedImage = () => {
    setAttachedImage(null);
    setTimeout(() => {
      textareaRef.current?.focus();
      adjustTextareaHeight();
    }, 20);
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

          {/* Centered Suggestion Chips with responsive wrap to prevent offscreen clipping on mobile */}
          <div className={getHeroSuggestionChipsContainerClass()}>
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
                className="text-xs font-medium px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 transition-colors shadow-xs whitespace-nowrap active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex-shrink-0"
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        /* Case 2: Conversation Message Feed & Floating Bottom Dock */
        <>
          {/* Scrollable Message Feed - pb-32 allows messages to scroll behind floating dock, pt-14 provides mobile clearance below floating buttons */}
          <div className="flex-1 overflow-y-auto subtle-scroll px-3 sm:px-4 md:px-6 pt-14 sm:pt-3 pb-32 sm:pb-36 space-y-2.5 sm:space-y-3">
            {/* Chat Messages Feed */}
            {messages.map((msg, idx) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={idx}
                  className={`w-full flex ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-2xl flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-2`}>
                    <div
                      className={`px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-xl sm:rounded-2xl text-xs sm:text-[13.5px] leading-normal sm:leading-relaxed ${
                        isUser
                          ? 'bg-slate-900 text-white rounded-tr-none shadow-xs'
                          : 'bg-white text-slate-900 rounded-tl-none shadow-xs'
                      }`}
                    >
                      {/* Attached Image Thumbnail inside User Message Bubble */}
                      {isUser && msg.image && (
                        <div
                          onClick={() => setLightboxImage(msg.image || null)}
                          className="mb-2 max-w-[170px] sm:max-w-[210px] rounded-lg sm:rounded-xl overflow-hidden border border-white/20 shadow-xs cursor-pointer group relative transition-transform duration-200 hover:scale-[1.02] active:scale-[0.99]"
                          title="Click to view full image"
                        >
                          <img
                            src={msg.image}
                            alt="Uploaded problem"
                            className="w-full h-auto object-cover max-h-40 sm:max-h-48 rounded-lg sm:rounded-xl"
                          />
                          <div className="absolute inset-0 bg-slate-900/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[1px]">
                            <span className="text-[10px] font-semibold text-white bg-slate-900/70 px-2 py-0.5 rounded-full border border-white/20">
                              Expand
                            </span>
                          </div>
                        </div>
                      )}

                      {isUser ? (
                        <div className="prose prose-sm max-w-none text-white prose-p:my-1">
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
                              className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-xs max-w-md animate-in fade-in duration-300"
                            >
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-[10px] font-bold text-slate-800 uppercase tracking-wider bg-white px-2 py-0.5 rounded-full border border-slate-200 font-display">
                                  Quiz Ready
                                </span>
                                <span className="text-[11px] font-semibold text-slate-500 capitalize">
                                  {parsedResult.difficulty} Difficulty
                                </span>
                              </div>
                              <h4 className="text-xs sm:text-sm font-display font-bold text-slate-900">{parsedResult.topic}</h4>
                              <p className="text-xs text-slate-600 mt-0.5">
                                Assessment with {parsedResult.total_questions} questions and granular dwell time tracking.
                              </p>
                              <button
                                onClick={() => navigate(`/quizzes/${parsedResult.quiz_id}`)}
                                className="mt-2.5 w-full inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 sm:py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors shadow-xs font-display cursor-pointer"
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
                              className="bg-rose-50/80 border border-rose-200 p-3 sm:p-3.5 rounded-xl max-w-md animate-in fade-in duration-200 text-xs text-rose-900 space-y-1.5 shadow-xs"
                            >
                              <div className="flex items-center gap-2 font-display font-semibold text-rose-800">
                                <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                                <span>Learning Assistant Notice</span>
                              </div>
                              <p className="text-rose-700 leading-relaxed font-sans text-xs">
                                {parsedResult.error || 'I encountered an issue preparing this practice quiz.'}
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
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-rose-300 text-rose-700 hover:bg-rose-100/60 rounded-lg text-xs font-medium transition cursor-pointer shadow-xs"
                              >
                                <span>Try Again</span>
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

            {/* Live In-Place Pedagogical Status Pill */}
            {loading && (
              <div className="w-full flex items-center justify-start py-1.5 animate-in fade-in duration-200">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200 shadow-2xs text-xs text-slate-700 font-sans">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-800 shrink-0" />
                  <span className="font-medium">
                    {agentSteps.length > 0
                      ? agentSteps[agentSteps.length - 1].text
                      : 'AI Instructor is thinking...'}
                  </span>
                </div>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Floating Prompt & Suggestions Dock - Pinned consistently regardless of scroll */}
          <div className="absolute bottom-1.5 left-2 right-2 sm:bottom-3 sm:left-4 sm:right-4 max-w-4xl mx-auto pointer-events-none z-20 flex flex-col gap-1 sm:gap-1.5">
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
                  className="text-xs font-medium px-2.5 py-1 rounded-lg sm:rounded-xl bg-white/95 backdrop-blur-xs border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 transition-colors shadow-xs whitespace-nowrap flex-shrink-0 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {/* Attached Image Preview Card (ChatGPT / Gemini style with smooth animation) */}
            {attachedImage && (
              <div className="pointer-events-auto flex items-center justify-between p-1.5 sm:p-2 bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-xl sm:rounded-2xl shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300 ease-out transition-all">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    onClick={() => setLightboxImage(attachedImage.base64)}
                    className="relative w-10 h-10 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl overflow-hidden border border-slate-200 flex-shrink-0 bg-slate-100 cursor-pointer group shadow-xs"
                    title="Click to preview full size"
                  >
                    <img
                      src={attachedImage.base64}
                      alt="Problem preview"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    />
                  </div>
                  <div className="min-w-0 flex flex-col">
                    <span className="text-xs font-semibold text-slate-800 truncate max-w-[180px] sm:max-w-xs">
                      {attachedImage.fileName}
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {attachedImage.fileSize}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveAttachedImage}
                  title="Remove attached image"
                  aria-label="Remove attached image"
                  className="p-1 sm:p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Floating Opaque Prompt Input Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="pointer-events-auto flex items-center gap-1.5 sm:gap-2 p-1 sm:p-1.5 bg-white border border-slate-200 rounded-xl sm:rounded-2xl shadow-lg transition-all focus-within:border-slate-400 focus-within:ring-2 focus-within:ring-slate-900/5"
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
                  disabled={(!input.trim() && !attachedImage) || loading}
                  title="Send Message"
                  aria-label="Send Message"
                  className="w-9 h-9 sm:w-10 sm:h-10 flex-shrink-0 flex items-center justify-center rounded-xl bg-slate-900 hover:bg-slate-800 text-white shadow-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] cursor-pointer"
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
            className={`fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-end justify-center sm:items-center p-0 sm:p-4 transition-opacity duration-300 ease-out cursor-pointer ${
              isClosingSheet ? 'opacity-0 pointer-events-none' : 'opacity-100 animate-in fade-in duration-300'
            }`}
            onClick={(e) => handleModalBackdropClick(e, handleCloseUploadSheet)}
          >
            <div
              className={`w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 pb-8 sm:pb-6 shadow-2xl border border-slate-200/90 cursor-default transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] transform ${
                isClosingSheet
                  ? 'translate-y-full sm:translate-y-6 sm:opacity-0 sm:scale-95'
                  : 'translate-y-0 sm:translate-y-0 opacity-100 sm:scale-100 animate-in slide-in-from-bottom-full sm:slide-in-from-bottom-6 duration-300'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* iOS-Style Sleek Drag Handle Pill */}
              <div className="w-10 h-1 rounded-full bg-slate-200 mx-auto mb-4 sm:hidden" />

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

      {/* Full-Resolution Lightbox Modal */}
      {lightboxImage && (
        <div
          onClick={() => setLightboxImage(null)}
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200 cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-4xl max-h-[90vh] bg-white rounded-2xl overflow-hidden shadow-2xl border border-slate-200 flex flex-col"
          >
            <div className="absolute top-2.5 right-2.5 z-10">
              <button
                onClick={() => setLightboxImage(null)}
                className="p-1.5 bg-slate-900/70 hover:bg-slate-900 text-white rounded-full transition-colors cursor-pointer backdrop-blur-xs"
                title="Close full view"
                aria-label="Close full view"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-auto max-h-[85vh] p-2 flex items-center justify-center bg-slate-950/5">
              <img
                src={lightboxImage}
                alt="Full resolution problem"
                className="max-w-full max-h-[80vh] object-contain rounded-xl"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
