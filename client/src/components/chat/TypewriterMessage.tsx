import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

interface TypewriterMessageProps {
  content: string;
  animate?: boolean;
  speedMs?: number;
  onUpdate?: () => void;
  onComplete?: () => void;
}

export const TypewriterMessage: React.FC<TypewriterMessageProps> = ({
  content,
  animate = false,
  speedMs = 12,
  onUpdate,
  onComplete,
}) => {
  const [displayedLength, setDisplayedLength] = useState(animate ? 0 : content.length);
  const [isTyping, setIsTyping] = useState(animate && content.length > 0);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    if (!animate || !content) {
      setDisplayedLength(content.length);
      setIsTyping(false);
      return;
    }

    setDisplayedLength(0);
    setIsTyping(true);

    let currentIndex = 0;
    // Step size: 3 chars per tick for smooth, fast reading pace
    const step = 3;

    timerRef.current = setInterval(() => {
      currentIndex += step;
      if (currentIndex >= content.length) {
        setDisplayedLength(content.length);
        setIsTyping(false);
        if (timerRef.current) clearInterval(timerRef.current);
        onComplete?.();
        onUpdate?.();
      } else {
        setDisplayedLength(currentIndex);
        onUpdate?.();
      }
    }, speedMs);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [content, animate]);

  const handleFastForward = () => {
    if (isTyping) {
      if (timerRef.current) clearInterval(timerRef.current);
      setDisplayedLength(content.length);
      setIsTyping(false);
      onComplete?.();
      onUpdate?.();
    }
  };

  const visibleText = content.slice(0, displayedLength);

  return (
    <div
      onClick={handleFastForward}
      className={`prose prose-sm max-w-none prose-slate relative transition-opacity ${
        isTyping ? 'cursor-pointer' : ''
      }`}
      title={isTyping ? 'Click message to skip typewriter animation' : undefined}
    >
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
        {visibleText}
      </ReactMarkdown>

      {/* Glowing Typewriter Cursor */}
      {isTyping && (
        <span
          className="inline-block w-2 h-4 ml-1 bg-[#7A22E8] rounded-xs animate-pulse align-middle"
          aria-hidden="true"
        />
      )}
    </div>
  );
};
