# Pragati

> **Intelligent Socratic AI Learning Companion & Telemetry-Driven Assessment Platform**  
> *Powered by AWS Bedrock Mantle (DeepSeek v3.1), LangChain, Supabase, and Modern Glassmorphism.*

---

## 1. Overview

**Pragati** is an AI-driven academic learning companion built to elevate STEM education through **Socratic inquiry**, **adaptive assessment**, and **granular cognitive telemetry**. Rather than spoon-feeding flat answers, Pragati guides students through first principles, diagnoses points of confusion using per-question dwell time and hint analytics, and dynamically constructs targeted practice quizzes tailored to each learner's evolving skill rating.

---

## 2. Key Features

- **Socratic AI Instructor**:
  - Interactive multi-turn academic tutor powered by **DeepSeek v3.1** on **AWS Bedrock Mantle**.
  - Dynamic LangChain tool calling (`generate_quiz`, `get_student_attempts`, `get_attempt_telemetry`, `explain_missed_question`) with zero hardcoded responses.
  - Smooth **Typewriter Streaming Effect** with an active glowing cursor and real-time **LaTeX math formatting** ($...$ and $$...$$ via KaTeX).
- **OCR Problem Snapshot Capture**:
  - Upload textbook or handwritten math problems via a slide-up **Action Sheet** with **Camera** and **Photo Gallery** capture options.
  - Automatically extracts equations and problem statements for Socratic tutoring.
- **Dynamic Quiz Arena**:
  - Practice quizzes generated on any academic topic with configurable difficulty.
  - Dual Monospace Exam Telemetry: Compact sticky bar displaying active question dwell time and total exam countdown.
  - Dynamic Elo skill rating adjustments based on performance.
- **Telemetry-Driven Student Analytics**:
  - Tracks question-by-question dwell time, hint consumption, and accuracy progression curves.
  - Topic mastery progress bars and one-click **"Tutor with AI"** remediation for missed and skipped questions.
- **Cognitive Prism Design System**:
  - Refined minimalist glassmorphism with frosted white translucent cards (`backdrop-blur-md`).
  - Brand identity in **Velvet Violet (`#7A22E8`)** and **Midnight Indigo (`#2E1D5E`)**.
  - Geometric typography featuring **Plus Jakarta Sans** headings, **Inter** body, and **JetBrains Mono** telemetry numbers.
  - Vector iconography strictly powered by **Lucide React** (zero emojis).

---

## 3. System Architecture & Security (BFF Pattern)

Pragati enforces a strict **Backend-for-Frontend (BFF)** security architecture:
1. **Zero Direct DB Access**: The React client NEVER talks directly to Supabase DB or Bedrock Mantle. All requests flow through the Node.js Express server (`/api/*`).
2. **Authenticated Guards**: All routes are guarded (`ProtectedRoute`) using Supabase Google OAuth and Passwordless Magic Link authentication.
3. **User Isolation**: All database queries and analytics are strictly partitioned by the authenticated `user_id`.

```mermaid
graph TD
    Client["React 18 Client (Vite + Tailwind)"] -->|Bearer JWT (/api/*)| Server["Node.js Express Server"]
    Server -->|LangChain Agent & Tools| Bedrock["AWS Bedrock Mantle (deepseek.v3.1)"]
    Server -->|Scoped Queries by user_id| Supabase[("Supabase PostgreSQL")]
```

For complete technical specifications, see [docs/architecture.md](docs/architecture.md).

---

## 4. Technology Stack

### Frontend (`/client`)
- **Core Framework**: React 18 with TypeScript & Vite 6
- **Routing**: React Router v7
- **Styling**: Tailwind CSS v3 with custom Cognitive Prism glassmorphic tokens
- **Typography**: Google Fonts (*Plus Jakarta Sans*, *Inter*, *JetBrains Mono*)
- **Math Formatting**: `react-markdown`, `remark-math`, and `rehype-katex`
- **Charts & Telemetry**: Recharts
- **Iconography**: Lucide React

### Backend (`/server`)
- **Server Runtime**: Node.js with Express & TypeScript
- **AI Agent Framework**: LangChain (`@langchain/core`, `@langchain/openai`)
- **LLM Engine**: AWS Bedrock Mantle DeepSeek v3.1 (`https://bedrock-mantle.us-east-1.api.aws/v1`)
- **Authentication & Database**: Supabase PostgreSQL with `@supabase/supabase-js`
- **Validation**: Zod schema validation
- **Testing**: Vitest

---

## 5. Project Structure

```
pragati/
├── client/                     # React frontend application
│   ├── public/                 # Static assets (official /logo.png favicon)
│   └── src/
│       ├── api/                # API client with auto-refreshing JWT headers
│       ├── components/
│       │   ├── auth/           # ProtectedRoute guard
│       │   ├── chat/           # TypewriterMessage streaming component
│       │   └── layout/         # AppShell fixed sidebar layout
│       ├── context/            # AuthContext (Google OAuth & Magic Link)
│       └── pages/              # Instructor, Quizzes, QuizArena, Analytics, Login
├── server/                     # Node.js Express backend
│   └── src/
│       ├── agent/              # LangChain agent, Bedrock connection, & tools
│       ├── config/             # Supabase client configuration
│       ├── middleware/         # Supabase JWT authentication middleware
│       ├── routes/             # Auth, Instructor, Quizzes, Analytics endpoints
│       └── services/           # Analytics calculation & Elo rating engines
├── docs/                       # Project Documentation
│   ├── architecture.md         # Full architectural specifications & BFF diagram
│   └── design.md               # Cognitive Prism UI design tokens & specifications
├── .gitignore                  # Production-grade git exclusion rules
└── package.json                # Root orchestration scripts
```

---

## 6. Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm or pnpm
- Supabase Project (PostgreSQL schema & Auth configured)
- AWS Bedrock Mantle API Key (`deepseek.v3.1` access)

### Environment Configuration

Create `server/.env` with the following keys:
```env
PORT=5000
SUPABASE_URL=https://<your-project-id>.supabase.co
SUPABASE_ANON_KEY=<your-supabase-anon-key>
AWS_BEDROCK_MANTLE=<your-aws-bedrock-mantle-api-key>
```

Create `client/.env` with the following keys:
```env
VITE_SUPABASE_URL=https://<your-project-id>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-supabase-anon-key>
```

### Installation

Install dependencies across the root, client, and server:
```bash
npm run install:all
```

---

## 7. Running the Application

### Development Mode
To start both the client and server concurrently:
```bash
npm run dev
```
- **Frontend**: `http://localhost:5173`
- **Backend API**: `http://localhost:5000`

Or start them individually:
```bash
npm run dev:server    # Starts Express backend with tsx watch
npm run dev:client    # Starts Vite frontend
```

### Production Build
To verify type safety and generate production bundles:
```bash
npm run build
```

### Automated Testing
To run the Vitest test suite (including live Bedrock Mantle tool calling integration tests):
```bash
npm test
```

---

## 8. Documentation

- [System Architecture & Security Specifications](docs/architecture.md)
- [Cognitive Prism Design System & Style Tokens](docs/design.md)
