# OCR & Image Upload Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the high-resolution image upload failure mode in Pragati by introducing zero-dependency client-side canvas compression, hardening the backend OCR endpoint against OOM/DoS with route-isolated limits and rate limiting, and optimizing Vision LLM prompt formatting for mathematical LaTeX extraction.

**Architecture:** 
1. Client-side: A browser `<canvas>` utility (`compressImage`) intercepts camera/gallery file selection, downscaling 12-48MP raw images to max 1600px dimension and 80% JPEG quality, dropping payload size from ~15MB down to ~300KB-600KB.
2. Server-side: Isolate Express body limits so global endpoints accept 100KB while `/api/instructor/ocr` accepts up to 5MB. Enforce a 8 req/min rate limiter on OCR.
3. Vision AI Pipeline: Invoke Bedrock Mantle vision models (`writer.palmyra-vision-7b` / `qwen.qwen3-vl-235b-a22b-instruct`) with structured instructions for converting mathematical equations to LaTeX (`$...$`).

**Tech Stack:** React, TypeScript, HTML5 Canvas API, Express, LangChain OpenAI adapter (`@langchain/openai`), Bedrock Mantle, Lucide React, Vitest.

**Spec:** [docs/architecture.md](file:///Users/aadityaparkash/Desktop/pragati/docs/architecture.md)

## Global Constraints
- Client MUST NEVER communicate directly with Supabase DB; all requests flow through Express `/api/*`.
- Use Lucide React icons only (NEVER emojis in UI copy, buttons, badges, or headers).
- Minimalist Glassmorphism design (white and slate monochrome theme).
- Verify builds with `npm run build` and ensure clean type-checking.

---

### Task 1: Client-Side Canvas Image Compression Utility

**Files:**
- Create: `client/src/utils/imageCompressor.ts`
- Test: `client/src/test/imageCompressor.test.ts`

**Interfaces:**
- Produces: `compressImageFile(file: File, maxDimension?: number, quality?: number): Promise<string>` (returns data URL base64)

- [ ] **Step 1: Write the failing test for image compression utility**

```typescript
// client/src/test/imageCompressor.test.ts
import { describe, it, expect } from 'vitest';
import { calculateTargetDimensions } from '../utils/imageCompressor';

describe('calculateTargetDimensions', () => {
  it('preserves dimensions if already smaller than maxDimension', () => {
    const { width, height } = calculateTargetDimensions(800, 600, 1600);
    expect(width).toBe(800);
    expect(height).toBe(600);
  });

  it('downscales proportionally when width exceeds maxDimension', () => {
    const { width, height } = calculateTargetDimensions(3200, 1600, 1600);
    expect(width).toBe(1600);
    expect(height).toBe(800);
  });

  it('downscales proportionally when height exceeds maxDimension', () => {
    const { width, height } = calculateTargetDimensions(1200, 2400, 1600);
    expect(width).toBe(800);
    expect(height).toBe(1600);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix client test`
Expected: FAIL with module `../utils/imageCompressor` not found.

- [ ] **Step 3: Implement minimal code for imageCompressor.ts**

```typescript
// client/src/utils/imageCompressor.ts
export function calculateTargetDimensions(
  width: number,
  height: number,
  maxDimension = 1600
): { width: number; height: number } {
  if (width <= maxDimension && height <= maxDimension) {
    return { width, height };
  }

  if (width > height) {
    const targetWidth = maxDimension;
    const targetHeight = Math.round((height * maxDimension) / width);
    return { width: targetWidth, height: targetHeight };
  } else {
    const targetHeight = maxDimension;
    const targetWidth = Math.round((width * maxDimension) / height);
    return { width: targetWidth, height: targetHeight };
  }
}

export function compressImageFile(
  file: File,
  maxDimension = 1600,
  quality = 0.8
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      return reject(new Error('Selected file is not an image'));
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to decode image data'));
      img.onload = () => {
        const { width, height } = calculateTargetDimensions(img.width, img.height, maxDimension);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('Failed to get canvas 2D context'));
        }

        ctx.drawImage(img, 0, 0, width, height);
        const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedBase64);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix client test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/utils/imageCompressor.ts client/src/test/imageCompressor.test.ts
git commit -m "feat(client): add image compressor utility with canvas downscaling"
```

---

### Task 2: Integrate Compression into Instructor Page Upload Flow

**Files:**
- Modify: `client/src/pages/InstructorPage.tsx:263-293`
- Consumes: `compressImageFile` from `client/src/utils/imageCompressor.ts`

- [ ] **Step 1: Update handleImageUpload in InstructorPage.tsx**

Replace uncompressed `reader.readAsDataURL(file)` with `compressImageFile(file)`:

```typescript
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    e.target.value = '';
    handleCloseUploadSheet();
    setOcrLoading(true);

    try {
      // Downscale high-resolution mobile photos (15MB -> ~350KB)
      const compressedBase64 = await compressImageFile(file, 1600, 0.82);

      const data = await apiRequest<{ extractedText: string }>('/api/instructor/ocr', {
        method: 'POST',
        body: JSON.stringify({ imageBase64: compressedBase64 }),
      });

      if (!data.extractedText || !data.extractedText.trim()) {
        throw new Error('No legible text or formula was detected in this image.');
      }

      setInput(
        `Here is the question from my upload:\n\n"${data.extractedText.trim()}"\n\nCan you guide me through solving it step-by-step?`
      );
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
```

- [ ] **Step 2: Verify client builds cleanly**

Run: `npm --prefix client run build`
Expected: Build succeeds with 0 errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/InstructorPage.tsx
git commit -m "feat(client): integrate canvas image compression before OCR upload"
```

---

### Task 3: Backend OCR Security, Rate Limiting & Vision Prompt Tuning

**Files:**
- Modify: `server/src/routes/instructorRoutes.ts:96-133`
- Modify: `server/src/middleware/rateLimiter.ts`

- [ ] **Step 1: Write automated test for OCR route validation and payload handling**

```typescript
// server/src/test/ocrRoute.test.ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../server.js';

describe('POST /api/instructor/ocr', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(app)
      .post('/api/instructor/ocr')
      .send({ imageBase64: 'data:image/jpeg;base64,123' });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Refine OCR endpoint with selective parser and robust LaTeX prompt**

In `server/src/routes/instructorRoutes.ts`:
- Ensure route-level body limit of `5mb` (compressed images are < 1MB).
- Refine system instruction to extract text and LaTeX math formulas ($...$ for inline, $$...$$ for block).
- Handle model response gracefully.

- [ ] **Step 3: Verify server tests pass**

Run: `npm --prefix server test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/instructorRoutes.ts server/src/test/ocrRoute.test.ts
git commit -m "feat(server): harden OCR route with LaTeX prompt tuning and route-specific payload limit"
```

---

### Task 4: Friendly In-Place Tool Streaming & Telemetry UX

**Files:**
- Modify: `server/src/agent/langchainAgent.ts:160-238`
- Modify: `client/src/pages/InstructorPage.tsx:508-556`

**Pedagogical Status Map:**
Convert developer jargon into friendly student-facing statuses:
- `thinking`: "AI Instructor is thinking..."
- `generate_quiz`: "Crafting your practice assessment..."
- `get_student_attempts`: "Looking up your recent quiz performance..."
- `get_attempt_telemetry`: "Reviewing the questions you found challenging..."
- `explain_missed_question`: "Preparing Socratic tutoring guidance..."
- `analyzing`: "Formulating step-by-step guidance..."

- [ ] **Step 1: Update processAgentChat onStep messages in server/src/agent/langchainAgent.ts**

Map raw tool names to friendly academic descriptions:
```typescript
const FRIENDLY_TOOL_STATUS: Record<string, string> = {
  generate_quiz: 'Crafting your practice assessment...',
  get_student_attempts: 'Looking up your recent quiz performance...',
  get_attempt_telemetry: 'Reviewing questions you found challenging...',
  explain_missed_question: 'Preparing Socratic guidance for this problem...',
};
```
When invoking `onStep`:
`onStep?.({ phase: 'calling_tool', tool: toolCall.name, text: FRIENDLY_TOOL_STATUS[toolCall.name] || 'Exploring academic tools...' });`

- [ ] **Step 2: Replace multi-line monospace log stack with single dynamic in-place status pill in client/src/pages/InstructorPage.tsx**

Replace lines 508-556 with a single compact animated pill:
```tsx
{loading && (
  <div className="w-full flex items-center justify-start py-2 animate-in fade-in duration-200">
    <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-slate-50 border border-slate-200/90 shadow-2xs text-xs text-slate-700">
      <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-800 shrink-0" />
      <span className="font-medium">
        {agentSteps.length > 0
          ? agentSteps[agentSteps.length - 1].text
          : 'AI Instructor is thinking...'}
      </span>
    </div>
  </div>
)}
```
When loading finishes, the pill gracefully dissolves.

- [ ] **Step 3: Commit**

```bash
git add server/src/agent/langchainAgent.ts client/src/pages/InstructorPage.tsx
git commit -m "feat(ux): optimize tool streaming with single friendly status pill"
```

---

### Task 5: Compact Vertical Space & Text Optimization (Mobile & Desktop)

**Files:**
- Modify: `client/src/utils/markdownCards.ts:7-16`
- Modify: `client/src/components/chat/TypewriterMessage.tsx:80-94`
- Modify: `client/src/pages/InstructorPage.tsx:400-432, 560-642`
- Modify: `client/src/pages/QuizArenaPage.tsx:540-625`
- Modify: `client/src/pages/AnalyticsPage.tsx:120-210`
- Modify: `client/src/utils/theme.ts:72-74, 120-123`

- [ ] **Step 1: Tighten markdownCardStyles in markdownCards.ts**

```typescript
export const markdownCardStyles = {
  list: 'space-y-1.5 my-1.5 pl-0 list-none',
  cardItem:
    'rounded-lg border border-slate-200/80 bg-slate-50/50 px-2.5 py-1.5 sm:px-3 sm:py-2 my-1 shadow-2xs text-slate-800 text-xs sm:text-[13px] leading-snug sm:leading-normal block',
  heading3:
    'font-display font-bold text-slate-900 mt-2.5 mb-1 text-xs sm:text-sm border-b border-slate-100 pb-0.5',
  blockquote:
    'bg-slate-50 border-l-3 border-slate-900 rounded-r-lg px-2.5 py-1.5 my-1.5 text-slate-700 text-xs sm:text-[13px] leading-snug',
  paragraph: 'my-1 sm:my-1.5 leading-snug sm:leading-normal text-xs sm:text-[13px] text-slate-800',
};
```

- [ ] **Step 2: Tighten chat bubble padding, message spacing, and dock padding in InstructorPage.tsx**

- Message bubbles: `px-3.5 py-2.5 sm:px-4 sm:py-3 rounded-xl sm:rounded-2xl text-xs sm:text-sm`
- Feed spacing: `space-y-2.5 sm:space-y-3 pt-14 sm:pt-3 pb-32 sm:pb-36`
- Prompt dock: `bottom-1.5 sm:bottom-3 left-2 right-2 sm:left-4 sm:right-4`
- Suggestion chips: `px-2.5 py-1 text-[11px] sm:text-xs rounded-lg sm:rounded-xl`
- Textarea input bar: `p-1 sm:p-1.5 rounded-xl sm:rounded-2xl`

- [ ] **Step 3: Tighten question cards and multiple choice options in QuizArenaPage.tsx**

- Question card padding: `p-3.5 sm:p-5 md:p-6 rounded-xl sm:rounded-2xl space-y-3 sm:space-y-4`
- Option cards: `p-2.5 sm:p-3.5 gap-3 rounded-xl` with `w-7 h-7 sm:w-8 sm:h-8 rounded-lg` option letter badges.

- [ ] **Step 4: Tighten metric cards and chart layout in AnalyticsPage.tsx and theme.ts**

- Stat cards: `p-3 sm:p-4 rounded-xl sm:rounded-2xl`
- Chart height: `h-56 sm:h-64`
- Container: `space-y-4 sm:space-y-5 pt-2 px-3 pb-6 sm:px-5 sm:py-4 md:px-6 md:py-5`

- [ ] **Step 5: Verify build**

Run: `npm --prefix client run build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add client/src/utils/markdownCards.ts client/src/pages/InstructorPage.tsx client/src/pages/QuizArenaPage.tsx client/src/pages/AnalyticsPage.tsx client/src/utils/theme.ts
git commit -m "style: optimize vertical space and padding across mobile and desktop"
```

---

### Task 6: Backend Security & Tiered Rate Limiting (TDD)

**Files:**
- Create: `server/src/middleware/rateLimiter.ts`
- Modify: `server/src/server.ts:20-40`
- Create: `server/src/test/rateLimiter.test.ts`
- Create: `server/src/test/security.test.ts`

- [ ] **Step 1: Write failing rate limiting tests**

```typescript
// server/src/test/rateLimiter.test.ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../server.js';

describe('Rate Limiting', () => {
  it('includes standard RateLimit headers', async () => {
    const res = await request(app).get('/health');
    expect(res.headers).toHaveProperty('ratelimit-limit');
    expect(res.headers).toHaveProperty('ratelimit-remaining');
  });
});
```

- [ ] **Step 2: Run test to verify it fails (RED)**

Run: `npm --prefix server test`
Expected: FAIL (missing ratelimit headers).

- [ ] **Step 3: Implement rate limiting in rateLimiter.ts & server.ts**

Install `express-rate-limit`:
```bash
npm --prefix server install express-rate-limit
```
Implement `globalLimiter`, `chatRateLimiter`, `ocrRateLimiter`, `quizRateLimiter`.
Set `server.headersTimeout = 20000; server.requestTimeout = 30000; server.keepAliveTimeout = 5000;`.
Restrict global JSON parser to `100kb`.

- [ ] **Step 4: Run tests to verify they pass (GREEN)**

Run: `npm --prefix server test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/middleware/rateLimiter.ts server/src/server.ts server/src/test/rateLimiter.test.ts server/src/test/security.test.ts
git commit -m "feat(security): add tiered rate limiting and payload boundaries"
```

---

### Task 7: Performance Benchmarking & Manual Browser Verification

**Files:**
- Modify/Run: `quality-assurance/scripts/autocannon-benchmark.js`

- [ ] **Step 1: Run Autocannon capacity benchmark**

Measure raw throughput, latency (p50, p95, p99), and rate limit enforcement:
```bash
node quality-assurance/scripts/autocannon-benchmark.js
```

- [ ] **Step 2: Browser manual verification via browser subagent**

- Test AI Instructor on Desktop & Mobile viewports:
  - Verify compact markdown list cards (reproducing the user's screenshot scenario).
  - Verify single friendly status pill during tool streaming.
  - Verify suggestion chips and prompt dock.
- Test Quiz Arena:
  - Verify compact question and option cards.
  - Test answer selection, hint drawer, and submission.
- Test Analytics Dashboard:
  - Verify metric cards, charts, and missed questions review.
- Capture screenshots for verification evidence.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-10-ocr-image-upload-optimization.md`. Two execution options:

1. **Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
