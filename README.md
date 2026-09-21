# Pragati (प्रगति)

<div align="center">

<img src="client/public/logo.png" alt="Pragati Logo" width="100" height="100" style="border-radius: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.08);" />

### Intelligent Socratic AI Learning Companion & Telemetry-Driven Assessment Arena

[![Live Demo](https://img.shields.io/badge/Live_Demo-pragati--aadi.web.app-7C3AED?style=for-the-badge&logo=firebase&logoColor=white)](https://pragati-aadi.web.app)
[![GitHub](https://img.shields.io/badge/GitHub-aadisthunder%2Fpragati-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/aadisthunder/pragati)

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.0-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Groq](https://img.shields.io/badge/Groq-LPU_Inference-F55036?style=flat-square&logo=groq&logoColor=white)](https://groq.com/)
[![Supabase](https://img.shields.io/badge/Supabase-Auth_&_Postgres-3ECF8E?style=flat-square&logo=supabase&logoColor=white)](https://supabase.com/)
[![Firebase](https://img.shields.io/badge/Firebase-Hosting-FFA611?style=flat-square&logo=firebase&logoColor=black)](https://firebase.google.com/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind-CSS_3.4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)

*Built for STEM students, competitive exam aspirants, and curious minds who want to master concepts through first principles instead of memorizing flat answers.*

**Live Application**: [https://pragati-aadi.web.app](https://pragati-aadi.web.app)

</div>

---

## Table of Contents

- [Overview](#overview)
- [Live Demo](#live-demo)
- [Core Features](#core-features)
- [System Architecture (BFF Pattern)](#system-architecture-bff-pattern)
- [AI Engine & Capabilities](#ai-engine--capabilities)
- [Design System](#design-system)
- [Security & Production Hardening](#security--production-hardening)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Environment Setup](#environment-setup)
  - [Local Development](#local-development)
  - [Testing](#testing)
- [Deployment Guide](#deployment-guide)
- [Hackathon Demo Access](#hackathon-demo-access)
- [License](#license)

---

## Overview

**Pragati** (*Sanskrit for "Progress"*) is an AI-driven academic learning platform engineered around an active **Closed-Loop Mastery Framework**. Rather than simply explaining answers or acting like a passive chat bot, Pragati helps students deeply learn any topic or subtopic, challenge their understanding through adaptive testing, diagnose weak spots with cognitive telemetry, and systematically review and re-learn missed concepts until 100% mastery is achieved.

Pragati unites:
1. **Deep Socratic Learning**: Active conceptual exploration through first-principles questioning and step-by-step guidance.
2. **On-Demand Adaptive Testing**: Multi-level assessment generation triggered when the student feels ready, complete with in-quiz scaffolding and hints.
3. **Cognitive Telemetry**: Precision tracking of per-question dwell time, hint dependencies, and hesitation patterns.
4. **Targeted Review & Re-Teaching**: Dedicated remediation in the Analytics suite where the AI teaches the exact concepts behind incorrect answers in a continuous loop to mastery.

---

## Live Demo

The production application is live and accessible:

- **Web Application**: [https://pragati-aadi.web.app](https://pragati-aadi.web.app)
- **Recruiter / Evaluator Quick Access**: On the login screen, click **"Instant Judge Login"** to evaluate the platform immediately with pre-loaded telemetry data, quiz attempts, and analytics without needing an OTP or Google account.

---

## Core Features

### 1. The Closed-Loop Mastery System (Core Experience)
The defining feature of Pragati is its self-reinforcing mastery cycle that transforms passive studying into verified conceptual competence:
- **Deep Conceptual Study**: Engage with the AI to deeply learn any topic or granular subtopic through first-principles reasoning without being spoon-fed answers.
- **On-Demand Adaptive Testing**: Whenever a student feels they have grasped a topic sufficiently, the AI agent generates a comprehensive test tailored to those exact topics across selectable difficulty levels (Beginner, Intermediate, Advanced).
- **In-Test Scaffolding & Hints**: While testing, students can request contextual hints if stuck, nudging critical thinking without spoiling the answer.
- **Cognitive Telemetry & Weak-Spot Diagnostics**: As tests are submitted, Pragati records dwell time per question, hint consumption, and accuracy to pinpoint specific conceptual vulnerabilities.
- **Targeted "Questions to Review" Re-Teaching**: On the Analytics page, a dedicated **Questions to Review** hub compiles every missed or skipped question. With a single click, the AI instructor steps in to actively re-teach the underlying concepts.
- **Iterative Loop to True Mastery**: Students retake assessments and review weak concepts in an ongoing loop until every topic is fully mastered.

### 2. Socratic AI Instructor & Multimodal Capture
- **First-Principles Dialogue**: Guides students with targeted questions, scaffolding, and hints rather than dumping direct solutions.
- **Sub-Second Streaming**: Powered by Groq LPU hardware with Server-Sent Events (SSE) streaming and live agent status pills ("Analyzing performance...", "Crafting your assessment...") that surface each tool call in real time.
- **Flawless KaTeX Math Rendering**: Inline ($E = mc^2$) and block ($$\int_a^b f(x)\,dx$$) scientific typesetting. A dual-layer LaTeX normalizer (server + client) rewrites every delimiter style the model might emit (`$...$`, `$$...$$`, `\(...\)`, `\[...\]`) into perfectly rendered math — stored conversation history included.
- **Dynamic Tool Calling**: Uses LangChain tools to inspect quiz history, diagnose missed questions, generate assessments, and pull performance telemetry on the fly — with multi-step tool loops and robust JSON repair for partial model outputs.
- **Multimodal Problem Snapshot Capture**: Slide-up camera and photo gallery sheet letting students capture physical textbook problems, handwritten equations, or diagrams. Images are client-side compressed (~15 MB photos down to ~350 KB) and read by Groq multimodal vision (`qwen/qwen3.8-27b`) for LaTeX OCR.
- **Interruptible Generation**: A one-click stop button aborts any in-flight AI response mid-stream.
- **Quick Prompt Chips**: Fast one-click prompt pills (*Ask a doubt*, *Request a quiz topic*, *Review performance*, *Review missed questions*) in a clean single line on desktop, swipeable on mobile.
- **Session Management**: Named chat sessions in a sidebar with deletion confirmation modals, instant cache-backed reload, and automatic first-message titling.

### 3. Interactive Quiz Arena
- **Dynamic Curriculum Generation**: AI crafts custom quizzes on any STEM topic with 4 choices, hints, and step-by-step explanations. Question count adapts to the request (e.g., "10 questions on AC circuits, advanced").
- **Answer-Key Protection**: The question-fetching API strips `correct_answer` and `explanation` before delivery to the browser, and a post-generation guard prevents the model from spoiling answers in chat.
- **Smart Quiz Palette**: Navigation grid showing attempted / unattempted / unvisited states with submit-time unanswered warnings.
- **Flexible Timing HUD**: Per-question dwell time tracked invisibly for telemetry, plus a generous overall countdown.
- **Immediate Socratic Remediation**: One-click transition from any quiz question directly into a tutoring session with the AI Instructor.
- **Share Quizzes**: Native Web Share API integration with clipboard fallback.

### 4. Telemetry-Driven Student Analytics
- **"Questions to Review" Hub**: Centralized review arena listing all incorrect/skipped questions with one-click AI tutoring sessions and bulk/single dismissal.
- **Cognitive Metrics**: Overall accuracy, average dwell time, total practice time, and accuracy progression curves (Recharts).
- **Topic Mastery Breakdown**: Per-topic accuracy bars across Beginner / Intermediate / Advanced difficulty tiers.
- **Adaptive Elo Rating**: Skill rating recalculated after every attempt (difficulty-weighted, floored at 800) with delta badges on the dashboard.

---

## System Architecture (BFF Pattern)

Pragati strictly adheres to the **Backend-for-Frontend (BFF)** architectural pattern. The frontend client **never** communicates directly with the database or external AI model providers.

```mermaid
graph TD
    subgraph Client ["Frontend (React 18 + Vite)"]
        UI["Glassmorphism UI"]
        AuthCtx["AuthContext (JWT Session)"]
        ApiClient["API Client (Auto-Refresh JWT, SWR Cache, Dedup)"]
    end

    subgraph Backend ["Backend (Node.js Express + LangChain)"]
        AuthMW["Auth Middleware (JWT Verify)"]
        RateLimit["Multi-Tier Rate Limiter (per-user)"]
        Router["Express API Routes (/api/*)"]
        Agent["LangChain Agent & Tools"]
        Vision["Groq Multimodal Vision Service"]
    end

    subgraph External ["Managed Cloud Services"]
        Groq["Groq Cloud API (LPU Inference)"]
        SupabaseAuth["Supabase Authentication"]
        SupabaseDB[("Supabase PostgreSQL (RLS Protected)")]
    end

    UI --> AuthCtx
    AuthCtx --> ApiClient
    ApiClient -->|Bearer JWT| AuthMW
    AuthMW --> RateLimit
    RateLimit --> Router
    Router -->|User-Scoped Queries| SupabaseDB
    Router --> Agent
    Agent --> Vision
    Vision --> Groq
    Agent --> Groq
    AuthCtx -.->|OAuth / Magic Link| SupabaseAuth
```

---

## AI Engine & Capabilities

| Capability | Model | Provider / Hardware | Notes |
| :--- | :--- | :--- | :--- |
| **Socratic Reasoning & Tools** | `openai/gpt-oss-120b` | Groq LPU | Tool-calling agent loop, SSE streaming |
| **Multimodal Problem Vision** | `qwen/qwen3.8-27b` | Groq LPU | LaTeX OCR extraction, one automatic retry |

*Model IDs are configurable via `GROQ_MODEL` / `GROQ_VISION_MODEL` environment variables.*

---

## Design System

Pragati features a **Minimalist Monochrome** visual language:
- **Palette**: Pristine white and slate tones with subtle translucent panels (`backdrop-blur`, `border-slate-200`).
- **Typography**:
  - **Headings**: Plus Jakarta Sans (bold, modern, tracking-tight).
  - **Body**: Inter (high-legibility reading experience).
  - **Numbers / Telemetry**: JetBrains Mono (precision exam countdown & timer).
- **Strict Iconography**: 100% **Lucide React** vector icons. **Zero emojis** anywhere in UI copy, buttons, badges, or headers.
- **KaTeX Typesetting**: Publication-quality math fonts loaded globally.
- **Fixed Navigation**: Minimalist 3-item sidebar:
  1. `AI Instructor` (Interactive tutoring)
  2. `Quizzes` (Assessment arena)
  3. `Analytics` (Performance telemetry)

---

## Security & Production Hardening

- **User Data Isolation**: Every database interaction runs through Supabase Row-Level Security (RLS) policies scoped to `auth.uid()` — 20+ owner-only policies across 7 tables, with a dedicated read-only policy set that neuters the public demo account.
- **Multi-Tier Per-User Rate Limiting** (authenticated middleware runs *before* limiters, so limits key on `user_id` with IP fallback):
  - Global API limiter: `120 req/min`
  - AI Chat endpoint: `20 req/min` (safeguards Groq free-tier quotas)
  - Vision OCR upload: `8 req/min`
  - Quiz & Analytics endpoints: `80 req/min`
- **Payload Boundaries**: 6 MB global JSON cap (sized above the 5 MB image-upload parser so vision uploads never hit a premature 413), preventing memory-exhaustion DoS.
- **Answer-Key Protection**: Correct answers and explanations are stripped server-side from question payloads delivered to the browser.
- **Security Headers**: `helmet()` enabled; strict CORS allowlist (localhost + configured production origins + Vercel previews).
- **Input Validation**: Zod schemas on every agent tool; chat history sanitizer caps turns and strips client-controlled fields; message size capped at 5,000 chars.
- **Automatic Profile Provisioning**: A `SECURITY DEFINER` trigger creates a `user_profiles` row for every new auth user, so Elo ratings persist correctly from the first attempt (includes a backfill for pre-existing users).
- **Zero Key Leakage**: Sensitive credentials (`GROQ_API_KEY`, Supabase keys) reside solely on the backend. Only the public anon key is delivered to the browser.
- **Graceful Degradation**: Quiz submission persists the attempt even if telemetry or rating updates fail, surfacing warnings instead of triggering duplicate submissions.

---

## Getting Started

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm** or **pnpm**
- **Supabase Account**: [supabase.com](https://supabase.com) (free project)
- **Groq API Key**: [console.groq.com](https://console.groq.com/keys)

### Environment Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/aadisthunder/pragati.git
   cd pragati
   ```

2. **Configure Backend Environment**:
   ```bash
   cp server/.env.example server/.env
   ```
   Edit `server/.env` and fill in your keys:
   ```env
   PORT=5000
   NODE_ENV=development
   SUPABASE_URL=https://<your-project>.supabase.co
   SUPABASE_ANON_KEY=<your-supabase-anon-key>
   GROQ_API_KEY=gsk_<your-groq-api-key>
   ```

3. **Configure Frontend Environment**:
   ```bash
   cp client/.env.example client/.env
   ```
   Edit `client/.env`:
   ```env
   VITE_SUPABASE_URL=https://<your-project>.supabase.co
   VITE_SUPABASE_ANON_KEY=<your-supabase-anon-key>
   VITE_API_URL=   # leave empty in local dev (Vite proxies /api to localhost:5000)
   ```

4. **Set up the database schema**:
   Run the SQL in [`supabase/schema.sql`](supabase/schema.sql) in your Supabase project's SQL editor (tables, RLS policies, and the profile-creation trigger).

### Local Development

1. **Install dependencies**:
   ```bash
   npm run install:all
   ```

2. **Start Development Servers**:
   ```bash
   # Terminal 1: Start Backend (Express on http://localhost:5000)
   cd server && npm run dev

   # Terminal 2: Start Frontend (Vite on http://localhost:5173)
   cd client && npm run dev
   ```

3. Open `http://localhost:5173` in your browser.

### Testing

Both frontend and backend use **Vitest**. The suites cover the pure-logic layer where regressions hurt most — LaTeX/math rendering, quiz navigation state, theming utilities, agent tool-argument sanitization, quiz JSON repair, and server boot:

```bash
# Run server tests (LaTeX normalizer, agent tool sanitizers, quiz JSON repair, server bootstrap)
cd server && npm test

# Run client tests (LaTeX normalizer, markdown card styling, quiz navigation, theme tokens)
cd client && npm test

# Or everything from the root
npm test
```

To verify production builds:
```bash
npm run build
```

---

## Deployment Guide

### Production Setup (Firebase + Supabase)

#### 1. Frontend on Firebase Hosting (`pragati-aadi`)
1. Build the production bundle:
   ```bash
   cd client && npm run build
   ```
2. Deploy to Firebase:
   ```bash
   npx firebase-tools deploy --only hosting --project pragati-aadi
   ```
   Live at: `https://pragati-aadi.web.app`

#### 2. Backend on Supabase Edge Runtime
- The backend API is deployed as a secure Supabase Edge Function (`supabase/functions/api/index.ts`).
- All database queries, telemetry tracking, and AI tutoring requests are routed through the backend proxy with Supabase JWT authentication and Row Level Security (RLS).

### Alternative Deployment Options

#### Frontend (Vercel)
1. Import the repository in [Vercel](https://vercel.com).
2. Set **Root Directory** to `client`.
3. Framework Preset: **Vite**.
4. Configure Environment Variables:
   - `VITE_SUPABASE_URL`: `https://<your-project>.supabase.co`
   - `VITE_SUPABASE_ANON_KEY`: `<your-supabase-anon-key>`
   - `VITE_API_URL`: `https://<your-backend-host>`
5. Deploy.

#### Backend (Render or Railway)
1. Create a new **Web Service** on [Render](https://render.com) or [Railway](https://railway.app).
2. Set **Root Directory** to `server`.
3. Build Command: `npm run build`
4. Start Command: `npm start` (executes `node dist/server.js`)
5. Configure Environment Variables:
   - `PORT`: `5000`
   - `NODE_ENV`: `production`
   - `SUPABASE_URL`: `https://<your-project>.supabase.co`
   - `SUPABASE_ANON_KEY`: `<your-supabase-anon-key>`
   - `GROQ_API_KEY`: `<your-groq-api-key>`
   - `CLIENT_URL` / `CORS_ORIGIN`: `https://pragati-aadi.web.app`

### Supabase URL Configuration
In your Supabase project dashboard under **Authentication -> URL Configuration**:
- **Site URL**: `https://pragati-aadi.web.app`
- **Redirect URLs**: Add `https://pragati-aadi.web.app/**`

---

## Hackathon Demo Access

For hackathon judges and evaluators, Pragati includes a **One-Click Demo Access** feature:
- Navigate to the `/login` page.
- Click **"Instant Judge Login"**.
- You will be authenticated immediately with pre-loaded telemetry data, quiz history, and analytics.

The demo account is **read-only by database policy** (RLS blocks it from inserting or deleting any data), so exploring it can never pollute real student data.

---

## License

This project is open source and available under the [MIT License](LICENSE).
