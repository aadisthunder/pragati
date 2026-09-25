# Pragati — AI Learning System

> **Pitch line:** *"Every other AI study tool answers questions. Pragati is an AI learning **agent**: it teaches, tests, diagnoses, and adapts — and it never forgets what you're trying to master."*

---

## The Problem

ChatGPT-style tutors have **no memory and no model of the learner**. They answer the question, then forget the student. Quiz apps don't know *why* you got something wrong, and static study plans don't react to what you just failed. Learning tools today are either **conversational without measurement**, or **measurable without conversation**.

**Pragati closes the loop.**

---

## What Makes It a Learning *Agent*, Not a Quiz Maker

Pragati runs a full **diagnose → teach → re-teach → plan** loop on top of a persistent learner model:

| Capability | What the agent does | Where judges see it |
|---|---|---|
| **Socratic teaching** | Never hands over answers; guides with probing questions, LaTeX-rendered math, per-goal memory | AI Instructor chat |
| **Agent memory** | Learning goals + subtopics persist per student and are injected into every chat as *PERSISTENT LEARNER MEMORY* | Goals popup → any chat |
| **Adaptive assessment** | Generates targeted quizzes on demand; grades server-side; captures dwell time, hints, skips per question | Quizzes Arena → Quiz Arena |
| **Concept mastery engine** | Maps every question to concepts with prerequisites; converts quiz evidence into per-concept mastery (0–1) | My Topics mastery bars |
| **Misconception diagnosis** | Detects prerequisite gaps ("failing chain rule because power rule is weak") and names the *next* concept to fix | Analytics + chat diagnosis |
| **Spaced review scheduling** | Weakest concepts are scheduled for review sooner (`next_review_at`), strongest pushed out | Mastery page / agent decisions |
| **Skill rating** | ELO-style rating that moves with every attempt (not a raw percentage) | Sidebar + results modal |
| **Analytics that act** | Missed-question review feeds straight back into Socratic re-teaching | Analytics → "Learn this" |

The agent loop in one sentence: **every quiz you take changes what the tutor says next and what you're tested on next.**

---

## The Adaptive Engine (the moat)

1. **Question → concept mapping** — explicit DB mappings for seeded quizzes, AI-embedded tags for generated ones, keyword fallback otherwise.
2. **Mastery update (pure, deterministic, unit-tested)** — `masteryCore.ts` converts per-question evidence (correct, skipped, dwell time, hints) into a 0–1 mastery with running averages. Same core runs in **both** the Express server and the Supabase Edge Function — one brain, two hosts.
3. **Prerequisite graph** — concepts declare prerequisites; the agent diagnoses whether a weak concept is *caused* by an upstream gap before recommending anything.
4. **Next-action decision** — the agent chooses between *teach prerequisite*, *re-teach concept*, *harder quiz*, or *spaced review* — and shows its trace (visible reasoning, not a black box).

---

## Core MVP Features (what's shipped)

- **First-login experience**: guided feature tour (5 slides) → goal-setting popup → personalized AI tutor. Replayable anytime from **Help** in the sidebar.
- **AI Instructor**: streaming Socratic chat with persistent goal memory, LaTeX rendering, chat-to-quiz generation.
- **Quizzes Arena**: search, generate via chat, attempt with per-question hints, instant server-graded results.
- **My Topics**: goals with AI-drafted subtopic plans, live mastery bars per subtopic.
- **Analytics**: accuracy trends, skill-rating progression, missed-question review with one-click Socratic re-teach.
- **Privacy by design**: every quiz is strictly **private per candidate** — RLS-enforced at the database (owner-only reads/writes on quizzes, questions, attempts, telemetry), with answer keys stripped at the API layer and grading done server-side.

## Non-Goals (deliberate MVP cuts)

- No multi-tenant classrooms/teacher dashboards — single-learner focus.
- No social sharing or public quizzes — mastery data stays private to the candidate.
- No mobile app — responsive web covers the demo flow.

---

## Security Hardening (done today)

- Removed two legacy permissive RLS policies that made **every** quiz/question row readable (answer keys included) by any authenticated user — now strictly owner-only, verified with a cross-user probe (foreign private quiz → 404, answer keys never in any response).
- Fixed a production-crashing duplicate variable declaration in the Edge Function (module-level SyntaxError → BOOT_ERROR for every request).
- 44 client + 117 server tests green; `tsc` builds clean on both packages.

---

## Demo Script (5 minutes)

1. **Login** → the feature tour pops automatically (5 slides, ~40 seconds) → set a goal ("Organic Chemistry") → Pragati greets you already knowing your goal.
2. **Ask the tutor** a doubt → watch it *ask you* a question back (Socratic), with clean math rendering.
3. **Generate a quiz from that chat** → attempt it → results modal with rating delta.
4. **Open My Topics** → the mastery bars *moved* from that quiz; the weakest subtopic is flagged as "Focus next".
5. **Analytics** → open a missed question → one click sends it back to the tutor for step-by-step re-teaching.
6. **Ask the chat**: *"Diagnose my weak spots"* → the agent reads your mastery data and prescribes the next action with its reasoning.

---

## Why This Wins

- **A real agent loop**, not a chat wrapper: measure → diagnose → adapt → re-teach, all wired into one learner model.
- **Deterministic core, LLM at the edges**: mastery math is pure and unit-tested (no hallucinated grades); the LLM does what it's good at (teaching, question generation).
- **Production discipline**: RLS-enforced privacy, server-side grading, answer keys never leave the server, both backends share one tested decision core.
- **Judge-ready UX**: guided tour, seeded demo account, one-click flows that always land on a meaningful screen.
