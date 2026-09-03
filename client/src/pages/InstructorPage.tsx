import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { apiRequest } from '../api/client';
import { TypewriterMessage } from '../components/chat/TypewriterMessage';
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
  User,
  Sparkles,
} from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  tool_calls?: any[];
  animate?: boolean;
}

export const InstructorPage: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [showUploadSheet, setShowUploadSheet] = useState(false);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Fetch recent history
    apiRequest<{ messages: Message[] }>('/api/instructor/history')
      .then((data) => {
        if (data.messages && data.messages.length > 0) {
          setMessages(
            data.messages.map((m) => ({
              ...m,
              animate: false,
            }))
          );
        } else {
          setMessages([
            {
              role: 'assistant',
              content:
                'Hello! I am your Socratic AI Instructor. Ask me any conceptual question in STEM, upload a snapshot of a difficult problem, or ask me to generate a personalized practice quiz on any topic!',
              animate: false,
            },
          ]);
        }
      })
      .catch(() => {
        setMessages([
          {
            role: 'assistant',
            content:
              'Hello! I am your Socratic AI Instructor. Ask me any conceptual question in STEM, upload a snapshot of a difficult problem, or ask me to generate a personalized practice quiz on any topic!',
            animate: false,
          },
        ]);
      });
  }, []);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSendMessage = async (textToSend?: string) => {
    const messageContent = textToSend || input;
    if (!messageContent.trim() || loading) return;

    const newMessages: Message[] = [
      ...messages,
      { role: 'user', content: messageContent, animate: false },
    ];
    setMessages(newMessages);
    if (!textToSend) setInput('');
    setLoading(true);

    try {
      const data = await apiRequest<{ reply: string; toolExecutions: any[] }>('/api/instructor/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: messageContent,
          history: newMessages.slice(-8),
        }),
      });

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.reply,
          tool_calls: data.toolExecutions,
          animate: true, // Smooth typewriter effect for newly generated response
        },
      ]);
    } catch (err: any) {
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
    <div className="flex flex-col h-full max-w-5xl mx-auto w-full font-sans relative">
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

      {/* Scrollable Message Feed with Header inside */}
      <div className="flex-1 overflow-y-auto subtle-scroll px-4 md:px-6 pt-4 pb-4 space-y-4">
        {/* Header - scrollable along with chat messages */}
        <div className="flex items-center gap-3 pb-4 mb-2 border-b border-slate-200/80">
          <div className="w-10 h-10 rounded-2xl bg-[#F3ECFF] text-[#7A22E8] flex items-center justify-center border border-[#D8B4FE] shadow-sm">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-display font-extrabold text-[#2E1D5E] tracking-tight">AI Instructor</h2>
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
              className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
            >
              <div
                className={`w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                  isUser
                    ? 'bg-[#2E1D5E] text-white shadow-sm'
                    : 'bg-[#7A22E8] text-white shadow-md shadow-purple-500/20'
                }`}
              >
                {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              <div className={`max-w-2xl space-y-3 ${isUser ? 'items-end' : 'items-start'}`}>
                <div
                  className={`p-4 rounded-3xl text-sm leading-relaxed ${
                    isUser
                      ? 'bg-[#2E1D5E] text-white rounded-tr-none'
                      : 'glass-card text-slate-900 rounded-tl-none border border-slate-200/90'
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
                          className="glass-card p-4 rounded-2xl border border-[#D8B4FE] bg-[#F3ECFF]/50 shadow-md max-w-md animate-in fade-in duration-300"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-bold text-[#7A22E8] uppercase tracking-wider bg-white px-2.5 py-0.5 rounded-full border border-[#D8B4FE] font-display">
                              Quiz Generated
                            </span>
                            <span className="text-xs font-semibold text-slate-500 capitalize">
                              {parsedResult.difficulty} Difficulty
                            </span>
                          </div>
                          <h4 className="text-sm font-display font-bold text-[#2E1D5E]">{parsedResult.topic}</h4>
                          <p className="text-xs text-slate-600 mt-1">
                            Assessment with {parsedResult.total_questions} questions and granular dwell time tracking.
                          </p>
                          <button
                            onClick={() => navigate(`/quizzes/${parsedResult.quiz_id}`)}
                            className="mt-3 w-full btn-deezer-primary py-2 text-xs font-display"
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

        {loading && (
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-2xl bg-[#7A22E8] text-white flex items-center justify-center flex-shrink-0 shadow-md shadow-purple-500/20">
              <Bot className="w-4 h-4" />
            </div>
            <div className="glass-card px-4 py-3 rounded-2xl rounded-tl-none flex items-center gap-2 text-xs font-medium text-slate-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#7A22E8]" />
              <span>AI Instructor is thinking Socratically...</span>
            </div>
          </div>
        )}
        <div ref={chatBottomRef} />
      </div>

      {/* Fixed Bottom Tray: Recommendations Row + Input Form */}
      <div className="p-4 md:px-6 md:pb-6 pt-3 bg-[#FAF8FD]/95 backdrop-blur-md border-t border-slate-200/80 z-10 flex flex-col gap-2.5">
        {/* Recommendations Chips Row - Located directly above input bar */}
        <div className="flex items-center gap-2 overflow-x-auto subtle-scroll pb-1">
          <span className="text-[10px] font-bold text-[#2E1D5E] uppercase tracking-wider font-display flex items-center gap-1 flex-shrink-0">
            <Sparkles className="w-3 h-3 text-[#7A22E8]" />
            <span>Suggestions:</span>
          </span>
          <button
            type="button"
            onClick={() => handleSendMessage("Generate a 3-question quiz on Calculus Derivatives")}
            className="text-xs font-semibold px-3.5 py-1.5 rounded-full bg-white border border-slate-200 hover:bg-[#F3ECFF] hover:border-[#D8B4FE] hover:text-[#7A22E8] text-slate-700 transition shadow-sm whitespace-nowrap flex-shrink-0"
          >
            Create Calculus Quiz
          </button>
          <button
            type="button"
            onClick={() => handleSendMessage("What questions did I get wrong in my recent quiz and how can I fix them?")}
            className="text-xs font-semibold px-3.5 py-1.5 rounded-full bg-white border border-slate-200 hover:bg-[#F3ECFF] hover:border-[#D8B4FE] text-[#7A22E8] transition shadow-sm whitespace-nowrap flex-shrink-0"
          >
            Review Missed Questions
          </button>
          <button
            type="button"
            onClick={() => handleSendMessage("Explain the underlying concepts and intuition behind the last topic")}
            className="text-xs font-semibold px-3.5 py-1.5 rounded-full bg-white border border-slate-200 hover:bg-[#F3ECFF] hover:border-[#D8B4FE] text-slate-700 hover:text-[#7A22E8] transition shadow-sm whitespace-nowrap flex-shrink-0"
          >
            Explain Concept
          </button>
        </div>

        {/* Input Bar Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-2"
        >
          {/* Plus button to open Camera / Gallery Action Sheet */}
          <button
            type="button"
            disabled={ocrLoading || loading}
            onClick={() => setShowUploadSheet(true)}
            title="Upload Problem (Camera or Gallery)"
            className="w-11 h-11 flex-shrink-0 rounded-xl border border-slate-200 bg-white hover:bg-[#F3ECFF] hover:border-[#D8B4FE] text-slate-700 hover:text-[#7A22E8] transition-all shadow-xs flex items-center justify-center disabled:opacity-50"
          >
            {ocrLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-[#7A22E8]" />
            ) : (
              <Plus className="w-5 h-5" />
            )}
          </button>

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a doubt, request a quiz topic, or ask to review missed questions..."
            disabled={loading}
            className="flex-1 px-5 py-2.5 bg-white/90 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7A22E8]/25 focus:border-[#7A22E8] transition shadow-xs"
          />

          {/* Square Send Button (Icon only, no text) */}
          <button
            type="submit"
            disabled={!input.trim() || loading}
            title="Send Message"
            className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-xl bg-[#7A22E8] hover:bg-[#6918C8] active:bg-[#5A12B0] text-white shadow-md shadow-purple-500/25 transition-all disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>

      {/* Bottom Action Sheet for Camera / Gallery */}
      {showUploadSheet && (
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-end justify-center sm:items-center p-0 sm:p-4 animate-in fade-in duration-150"
          onClick={() => setShowUploadSheet(false)}
        >
          <div
            className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl border border-slate-200/90 animate-in slide-in-from-bottom-4 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-display font-bold text-[#2E1D5E]">Upload Problem Snapshot</h3>
                <p className="text-xs text-slate-500 mt-0.5">Choose capture method for Socratic AI problem solving</p>
              </div>
              <button
                onClick={() => setShowUploadSheet(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              {/* Option 1: Camera */}
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="w-full flex items-center gap-4 p-4 rounded-2xl border border-slate-200/90 hover:border-[#D8B4FE] hover:bg-[#F3ECFF]/50 transition-all text-left group"
              >
                <div className="w-12 h-12 rounded-2xl bg-[#F3ECFF] text-[#7A22E8] group-hover:bg-[#7A22E8] group-hover:text-white flex items-center justify-center transition-colors shadow-xs">
                  <Camera className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-display font-bold text-slate-900 group-hover:text-[#7A22E8] transition-colors">
                    Take Photo with Camera
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">Snap a textbook or handwritten formula</p>
                </div>
              </button>

              {/* Option 2: Gallery / Files */}
              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                className="w-full flex items-center gap-4 p-4 rounded-2xl border border-slate-200/90 hover:border-[#D8B4FE] hover:bg-[#F3ECFF]/50 transition-all text-left group"
              >
                <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-700 group-hover:bg-[#7A22E8] group-hover:text-white flex items-center justify-center transition-colors shadow-xs">
                  <ImageIcon className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-display font-bold text-slate-900 group-hover:text-[#7A22E8] transition-colors">
                    Photo Gallery / Files
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">Select a screenshot or photo from device</p>
                </div>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowUploadSheet(false)}
              className="mt-4 w-full py-2.5 text-xs font-semibold text-slate-500 hover:text-slate-800 rounded-xl transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
