# AI-Assisted Development Disclosure

Pragati was built with the help of AI coding tools. This document records where
AI was used and where human decisions were made, in the interest of
transparency for hackathon judges, recruiters, and open-source users.

## Tools used

- **Claude (Anthropic) via Codebuff** — an AI coding agent that implemented
  large parts of the codebase under direct human direction, reviewed every
  change, and ran the test suites.
- **Groq-hosted LLMs** — the product's own runtime AI: the Socratic tutor and
  quiz generator (OpenAI-compatible tool calling via the Supabase Edge
  Function).

## What AI helped with

- Scaffolding and implementing features (React pages, Express/Edge Function
  routes, the adaptive decision core, database schema and RLS policies).
- Writing and expanding the test suites, including the deterministic
  evaluation harness.
- Debugging, refactoring, and documenting (this file and the README).

## What humans decided

- The product concept: the mastery loop, the adaptive-agent architecture
  (learner model → diagnosis → next action → intervention → measurement), and
  the deliberate split where a **deterministic rule engine decides pedagogy and
  the LLM only generates content**.
- Every design trade-off, including what NOT to build (no payments, social
  feeds, or document chatbots — anything that dilutes the core loop).
- Review of all AI-generated code before it landed; the agent worked under
  continuous human direction and nothing shipped unreviewed.

## Core product decisions made by the team (with AI assistance)

| Decision | Rationale |
| --- | --- |
| Deterministic decision core, LLM for content only | Adaptation must be testable, evaluable, and demo-safe; a rule engine cannot hallucinate a wrong lesson plan |
| Per-concept mastery from quiz telemetry | Converts raw events into learner state the agent can act on |
| Prerequisite graph with root-cause diagnosis | Identifies *why* a learner fails, not just *that* they fail |
| Judge Mode with seeded, writable demo account | Live LLM demos fail; the centerpiece must be deterministic |

## Third-party models and services

- Groq inference API (tutor chat, quiz generation, image OCR)
- Supabase (auth, Postgres with Row-Level Security, Edge Functions)
- Firebase Hosting (static client delivery)

All evaluation metrics published in this repository are produced by the
deterministic test suite in `server/src/__tests__/masteryEvaluation.test.ts`
and can be reproduced by running `npm --prefix server test`.
