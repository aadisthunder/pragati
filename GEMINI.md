# GEMINI.md - Pragati Project Workspace Rules

## Core Architectural Directives
- **Client-Server Architecture**: The frontend MUST NEVER communicate directly with Supabase DB. All data operations and AI calls must flow through the backend Node.js Express server (`/api/*`).
- **User Data Isolation**: Every database interaction must filter by the authenticated Supabase `user_id`. No cross-user data leakage.
- **Authentication**: Google OAuth and Passwordless Email Magic Link only. All application routes must be wrapped with an authentication guard (`ProtectedRoute`).
- **AI Agent (LangChain)**: Use LangChain tools in the Node.js backend. LLM is powered by Bedrock Mantle (`https://bedrock-mantle.us-east-1.api.aws/v1`) using `deepseek.v3.1` with `AWS_BEDROCK_MANTLE` API key.
- **Agent Capabilities**: Socratic question answering, dynamic quiz generation based on topic, quiz analytics retrieval, and tutoring on missed/skipped questions via tool calls.
- **Design System**: Minimalist Glassmorphism (white-themed, subtle blur, frosted white panels, crisp borders).
- **Icons & Symbols**: Use Lucide React icons ONLY. NEVER use emojis in UI copy, buttons, badges, or headers.
- **Navigation**: Fixed sidebar with exactly 3 items: AI Instructor, Quizzes, Analytics.
- **Verification Protocol**: Always verify builds with `npm run build` and ensure clean type-checking before reporting completion.
