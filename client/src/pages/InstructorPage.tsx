import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { apiRequest } from '../api/client';
import { Bot, Send, Upload, CheckSquare, Loader2, ArrowRight, User } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  tool_calls?: any[];
}

export const InstructorPage: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Fetch recent history
    apiRequest<{ messages: Message[] }>('/api/instructor/history')
      .then((data) => {
        if (data.messages && data.messages.length > 0) {
          setMessages(data.messages);
        } else {
          setMessages([
            {
              role: 'assistant',
              content:
                'Hello! I am your Socratic AI Instructor. Ask me any conceptual question in STEM, upload a snapshot of a difficult problem, or ask me to generate a personalized practice quiz on any topic!',
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

    const newMessages: Message[] = [...messages, { role: 'user', content: messageContent }];
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
        },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Sorry, I encountered an issue: ${err.message}. Please check your connection or try again.`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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
    <div className="flex flex-col h-full max-w-5xl mx-auto w-full p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-200/80">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center border border-sky-200/60">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">AI Instructor</h2>
            <p className="text-xs text-slate-500 font-medium">
              Socratic tutor powered by Bedrock Mantle DeepSeek
            </p>
          </div>
        </div>

        {/* Quick actions */}
        <div className="hidden sm:flex items-center gap-2">
          <button
            onClick={() => handleSendMessage("Generate a 3-question quiz on Calculus Derivatives")}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 transition shadow-sm"
          >
            Create Calculus Quiz
          </button>
          <button
            onClick={() => handleSendMessage("What questions did I get wrong in my recent quiz and how can I fix them?")}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-violet-700 transition shadow-sm"
          >
            Review Missed Questions
          </button>
        </div>
      </div>

      {/* Chat Messages Feed */}
      <div className="flex-1 overflow-y-auto subtle-scroll space-y-4 pr-2 pb-4">
        {messages.map((msg, idx) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={idx}
              className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
            >
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                  isUser
                    ? 'bg-slate-900 text-white'
                    : 'bg-sky-600 text-white shadow-sm'
                }`}
              >
                {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              <div className={`max-w-2xl space-y-3 ${isUser ? 'items-end' : 'items-start'}`}>
                <div
                  className={`p-4 rounded-2xl text-sm leading-relaxed ${
                    isUser
                      ? 'bg-slate-900 text-white rounded-tr-none'
                      : 'glass-card text-slate-900 rounded-tl-none border border-slate-200/90'
                  }`}
                >
                  <div className="prose prose-sm max-w-none prose-slate">
                    <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                      {msg.content}
                    </ReactMarkdown>
                  </div>
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
                          className="glass-card p-4 rounded-xl border-2 border-sky-300/80 bg-sky-50/50 shadow-md max-w-md animate-in fade-in"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] font-bold text-sky-700 uppercase tracking-wider bg-sky-100 px-2 py-0.5 rounded border border-sky-200">
                              Quiz Generated
                            </span>
                            <span className="text-xs font-semibold text-slate-500 capitalize">
                              {parsedResult.difficulty} Difficulty
                            </span>
                          </div>
                          <h4 className="text-sm font-bold text-slate-900">{parsedResult.topic}</h4>
                          <p className="text-xs text-slate-600 mt-1">
                            Assessment with {parsedResult.total_questions} questions and granular dwell time tracking.
                          </p>
                          <button
                            onClick={() => navigate(`/quizzes/${parsedResult.quiz_id}`)}
                            className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-lg shadow-sm transition"
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
            <div className="w-8 h-8 rounded-lg bg-sky-600 text-white flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <div className="glass-card px-4 py-3 rounded-2xl rounded-tl-none flex items-center gap-2 text-xs font-medium text-slate-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-600" />
              <span>AI Instructor is thinking Socratically...</span>
            </div>
          </div>
        )}
        <div ref={chatBottomRef} />
      </div>

      {/* Input Area with Upload Button */}
      <div className="pt-3 border-t border-slate-200/80">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageUpload}
            accept="image/*"
            className="hidden"
          />

          <button
            type="button"
            disabled={ocrLoading || loading}
            onClick={() => fileInputRef.current?.click()}
            title="Upload Question Snapshot for OCR"
            className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-sky-600 transition shadow-sm disabled:opacity-50 flex items-center justify-center"
          >
            {ocrLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-sky-600" />
            ) : (
              <Upload className="w-5 h-5" />
            )}
          </button>

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a doubt, request a quiz topic, or ask to review missed questions..."
            disabled={loading}
            className="flex-1 px-4 py-2.5 bg-white/90 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 transition shadow-sm"
          />

          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-sm font-bold shadow-sm hover:shadow transition disabled:opacity-50 flex items-center gap-1.5"
          >
            <span>Send</span>
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
