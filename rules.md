# Pragati - Project Engineering Rules & Architecture Directives

## 1. Architectural Integrity & Security (Strict BFF Pattern)
- **Zero Direct Client-DB Access**: The React frontend MUST NEVER connect directly to Supabase DB or execute direct database queries. All queries, mutations, and AI calls must flow strictly through the backend Node.js server (`/api/*`).
- **Strict User Isolation**: Every backend endpoint and database query must enforce user isolation using the verified Supabase JWT `user_id`. A user can never access or mutate another student's quizzes, attempts, telemetry, or chat history.
- **Protected Routes Only**: The client must guard all dashboard routes behind an authentication wrapper (`ProtectedRoute`). Unauthenticated users are strictly redirected to `/login`.

## 2. Authentication Protocol
- **Supported Methods**:
  1. Google OAuth (`supabase.auth.signInWithOAuth({ provider: 'google' })`)
  2. Passwordless Email Magic Link (`supabase.auth.signInWithOtp({ email })`)
- **No Passwords**: Password-based authentication is explicitly disabled for simplicity and security.
- **Session Verification**: The backend validates the Supabase Bearer token via `authMiddleware` on every incoming API request and populates `req.user`.

## 3. AI Instructor & Agent Architecture (LangChain + Bedrock Mantle)
- **Engine**: LangChain agent running in the backend Node.js environment.
- **LLM Provider**: Amazon Bedrock Mantle endpoint (`https://bedrock-mantle.us-east-1.api.aws/v1`) using the `AWS_BEDROCK_MANTLE` API key.
- **Preferred Models**: `deepseek.v3.1` (sub-400ms ultra-fast inference) or `zai.glm-4.7`.
- **Dedicated Agent Tools**:
  - `generate_quiz`: Generates structured quizzes based on requested topic and difficulty, storing them in PostgreSQL.
  - `get_user_quiz_history`: Retrieves quizzes taken by the student.
  - `get_quiz_analytics`: Fetches telemetry (time taken, dwell time, hints used, skipped/missed questions).
  - `explain_missed_questions`: Socratic tutoring specifically addressing questions the student missed or skipped during their quiz.

## 4. UI & Aesthetic Standards
- **Theme**: Minimalist Glassmorphism (pure white canvas `#FFFFFF` / paper off-white `#F8FAFC`, frosted glass cards `bg-white/80 backdrop-blur-md border border-slate-200/80 shadow-sm`).
- **Icons**: Lucide React icons ONLY (`lucide-react`).
- **Emojis**: STRICTLY NO EMOJIS anywhere in the UI, buttons, headers, or badges.
- **Consistent Navigation**: Fixed sidebar with exactly 3 main tabs:
  1. AI Instructor (`/instructor`)
  2. Quizzes (`/quizzes`)
  3. Analytics (`/analytics`)

## 5. Telemetry & Analytics
- **Granular Quiz Tracking**:
  - Total test duration in seconds.
  - Per-question dwell time (active time spent on each question).
  - Hint usage counter per question.
  - Flagging skipped questions and incorrect attempts for AI tutor remediation.

## 6. Verification & Quality Assurance
- Frontend must build cleanly with `npm run build` and have zero TypeScript errors.
- Backend must validate all request payloads using Zod or typed DTOs.
