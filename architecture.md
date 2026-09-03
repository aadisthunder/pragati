# Pragati - System Architecture & Technical Specifications
*Client-Server Architecture • Backend LangChain Agent • Supabase Infrastructure • Bedrock Mantle LLM*

---

## 1. Architectural Model & Security Boundaries (Strict BFF Pattern)

Pragati is architected with a strict **Backend-for-Frontend (BFF)** pattern.
**The frontend client NEVER interacts directly with the database or third-party AI models.**

```mermaid
graph TD
    subgraph Client ["Client Application (React + Vite + TS + Tailwind)"]
        AuthView["Auth (Google OAuth & Email Magic Link)"]
        Sidebar["Consistent Sidebar (Instructor, Quizzes, Analytics)"]
        InstructorUI["AI Instructor Chat Interface"]
        QuizUI["Interactive Quiz Arena & Telemetry Tracker"]
        AnalyticsUI["Student Analytics & Telemetry Dashboard"]
        APIClient["BFF API Client (/api/* with Bearer JWT)"]
        
        AuthView --> APIClient
        Sidebar --> InstructorUI & QuizUI & AnalyticsUI
        InstructorUI & QuizUI & AnalyticsUI --> APIClient
    end

    subgraph Server ["Backend API & Agent Gateway (Node.js + Express + TS)"]
        AuthMW["Supabase JWT Verification Middleware"]
        Router["Express API Router"]
        
        subgraph AgentEngine ["Backend AI Agent Engine (LangChain)"]
            LCAgent["LangChain Tool-Calling Agent"]
            Tool1["Tool: generate_quiz"]
            Tool2["Tool: get_student_attempts"]
            Tool3["Tool: get_attempt_telemetry"]
            Tool4["Tool: explain_missed_question"]
            
            LCAgent --> Tool1 & Tool2 & Tool3 & Tool4
        end

        subgraph CoreServices ["Core Backend Services"]
            QuizService["Quiz & Telemetry Service"]
            AnalyticsService["Analytics Aggregator & Telemetry Calculator"]
        end

        DBAdapter["Supabase Admin SDK Client (Service Role)"]
    end

    subgraph CloudInfra ["Cloud Infrastructure & Persistence"]
        BedrockMantle["AWS Bedrock Mantle Endpoint (deepseek.v3.1)"]
        SupabaseAuth["Supabase Auth (Google OAuth + Magic Link OTP)"]
        SupabaseDB[("Supabase PostgreSQL (pragati)")]
    end

    APIClient -->|All Requests with Bearer JWT| AuthMW
    AuthMW --> Router
    Router --> AgentEngine & CoreServices
    AgentEngine --> BedrockMantle
    AgentEngine --> DBAdapter
    CoreServices --> DBAdapter
    DBAdapter --> SupabaseDB
    AuthView -.->|Sign In / Verify OTP| SupabaseAuth
```

---

## 2. Authentication & Data Isolation

1. **Authentication Providers**:
   - **Google OAuth**: One-click authentication with Google.
   - **Passwordless Email Magic Link**: Users enter email and receive a secure OTP / magic link. Zero password storage or leaks.
2. **Protected Routes**:
   - Every application route (`/instructor`, `/quizzes`, `/analytics`) is wrapped with `ProtectedRoute`.
   - Unauthenticated visitors are redirected to `/login`.
3. **Strict User Data Isolation**:
   - The backend `authMiddleware` verifies the Supabase access token on every request.
   - The decoded `user.id` is injected into `req.user`.
   - All database queries filter strictly by `user_id = req.user.id`.

---

## 3. Backend AI Agent (LangChain + Bedrock Mantle)

The AI Instructor is an autonomous **LangChain Tool-Calling Agent** running inside the Node.js backend.

### Model Configuration
- **Endpoint**: `https://bedrock-mantle.us-east-1.api.aws/v1`
- **Authentication**: `process.env.AWS_BEDROCK_MANTLE`
- **Default Model**: `deepseek.v3.1` (sub-400ms ultra-fast inference and strong reasoning) with fallback to `zai.glm-4.7` or `mistral.mistral-large-3-675b-instruct`.

### Dedicated Agent Tools
1. **`generate_quiz(topic, difficulty, num_questions)`**:
   - Dynamically constructs a pedagogical assessment with multiple choice questions, options, hints, and explanations.
   - Inserts the generated quiz and questions into Supabase.
   - Returns the created quiz ID and summary for the student.
2. **`get_student_attempts()`**:
   - Fetches the current student's quiz history, scores, and dates.
3. **`get_attempt_telemetry(attempt_id)`**:
   - Retrieves granular performance metrics: dwell time per question, hints requested, and identifies questions the student missed or skipped.
4. **`explain_missed_question(question_id)`**:
   - Fetches the missed question prompt, the student's incorrect selection, and the correct rationale to deliver targeted Socratic remediation.

---

## 4. Database Schema (Supabase PostgreSQL: `rraemkgnxfrcdjfvpiml`)

```mermaid
erDiagram
    USERS ||--o{ QUIZZES : generates
    USERS ||--o{ QUIZ_ATTEMPTS : completes
    USERS ||--o{ CHAT_SESSIONS : owns
    QUIZZES ||--|{ QUESTIONS : contains
    QUIZZES ||--o{ QUIZ_ATTEMPTS : evaluated_in
    QUIZ_ATTEMPTS ||--|{ QUESTION_TELEMETRY : records
    CHAT_SESSIONS ||--|{ CHAT_MESSAGES : contains

    USERS {
        uuid id PK
        string email
        string full_name
        timestamp created_at
    }

    QUIZZES {
        uuid id PK
        uuid created_by FK
        string topic
        string difficulty
        int total_questions
        timestamp created_at
    }

    QUESTIONS {
        uuid id PK
        uuid quiz_id FK
        text prompt
        jsonb options
        string correct_answer
        text hint
        text explanation
        int order_index
    }

    QUIZ_ATTEMPTS {
        uuid id PK
        uuid user_id FK
        uuid quiz_id FK
        int score
        int total_time_sec
        float accuracy_pct
        timestamp completed_at
    }

    QUESTION_TELEMETRY {
        uuid id PK
        uuid attempt_id FK
        uuid question_id FK
        string selected_answer
        boolean is_correct
        boolean is_skipped
        int dwell_time_sec
        int hints_used
    }

    CHAT_SESSIONS {
        uuid id PK
        uuid user_id FK
        string title
        timestamp created_at
    }

    CHAT_MESSAGES {
        uuid id PK
        uuid session_id FK
        string role
        text content
        jsonb tool_calls
        timestamp created_at
    }
```

---

## 5. Technology Stack & Project Structure

### Frontend (`client/`)
- **Framework**: React 18+ (Vite)
- **Language**: TypeScript
- **Styling**: Tailwind CSS with Glassmorphism tokens (`bg-white/80 backdrop-blur-md border border-slate-200/80 shadow-sm`)
- **Icons**: `lucide-react` (Strictly NO emojis)
- **Math & Markdown**: `react-markdown`, `remark-math`, `rehype-katex`
- **Charts**: Recharts (clean 2D lines & bar graphs)

### Backend (`server/`)
- **Runtime**: Node.js
- **Framework**: Express.js with TypeScript
- **AI Agent**: LangChain (`@langchain/core`, `@langchain/openai`)
- **Database Client**: `@supabase/supabase-js` (Service Role for admin queries)
- **Validation**: Zod schema parsing

### Root Layout
```text
pragati/
├── client/                     # Vite + React 18 + TS Frontend
│   ├── src/
│   │   ├── api/                # API client with Supabase JWT
│   │   ├── components/
│   │   │   ├── layout/         # Glassmorphism AppShell & Fixed Sidebar
│   │   │   ├── auth/           # Google OAuth & Email Magic Link forms
│   │   │   ├── instructor/     # LangChain Agent Chat UI & Tool visualizers
│   │   │   ├── quiz/           # Quiz Arena, dual timers, hint reveal
│   │   │   └── analytics/      # Telemetry scorecards, dwell time breakdown
│   │   ├── context/            # AuthContext, AppContext
│   │   ├── App.tsx
│   │   └── main.tsx
├── server/                     # Express + TypeScript Backend
│   ├── src/
│   │   ├── agent/              # LangChain Agent & Tools (quiz gen, telemetry)
│   │   ├── middleware/         # authMiddleware (Supabase JWT verification)
│   │   ├── routes/             # /api/instructor, /api/quizzes, /api/analytics
│   │   ├── db/                 # Supabase client & migration scripts
│   │   └── server.ts
├── rules.md                    # Project Engineering Rules
├── GEMINI.md                   # Antigravity Workspace Directives
├── architecture.md             # System Architecture & Contracts
├── design.md                   # Minimalist Glassmorphism UI Guidelines
└── .env                        # Bedrock Mantle & Supabase Credentials
```
