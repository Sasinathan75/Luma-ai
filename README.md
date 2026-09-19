# Luma — AI Multimodal Assistant

Luma is a standalone general-purpose multimodal assistant for text, voice, images, documents, and architecture-aware reasoning. Its product promise is simple: **Ask anything. Speak anything. Upload anything.**

This implementation follows the supplied PRD, technical stack, UI design, and master build prompt while adapting the frontend to the managed WebDev stack: React 19 + Vite + TypeScript + Tailwind CSS, Express/tRPC server procedures, Drizzle/MySQL persistence, Manus OAuth, built-in LLM/storage/Whisper integrations, and browser speech APIs.

## Included

- Responsive geometric home and chat workspace inspired by the provided design direction without copying proprietary artwork.
- General questions with automatic architecture-intent enhancement.
- Architecture-aware prompting for planning, buildings, floor plans, orientation, circulation, daylight, ventilation, materials, BIM/CAD/Revit, and construction concepts.
- Image analysis workflow for JPG, JPEG, PNG, and WEBP with a visible-facts / estimates / assumptions / recommendations safety framing.
- Document workflow for PDF, TXT, and DOCX with file validation and document-grounded prompts.
- Voice input with the Web Speech API and spoken answer playback with play/stop/replay behavior through browser SpeechSynthesis.
- Copy, listen, regenerate, thumbs up, and thumbs down response controls.
- Authenticated conversation persistence with database-backed history, rename-ready model, and delete operations; guest mode uses localStorage for continuity.
- Server-side AI calls through the built-in LLM helper. Private keys never enter the browser.
- Transparent local demo mode when platform AI credentials are unavailable; the UI does not pretend an external model is connected.
- Attachment storage through the built-in S3-compatible storage helper with sanitized names and a 10 MB server-side limit.

## Run locally in the WebDev project

```bash
pnpm install
pnpm db:push
pnpm dev
```

Useful checks:

```bash
pnpm check
pnpm test
pnpm build
```

The managed project provides the following environment values automatically in its runtime:

- `DATABASE_URL`
- `JWT_SECRET`
- `VITE_APP_ID`
- `OAUTH_SERVER_URL`
- `VITE_OAUTH_PORTAL_URL`
- `BUILT_IN_FORGE_API_URL`
- `BUILT_IN_FORGE_API_KEY`

For a non-managed deployment, create a `.env` from `.env.example`, provide the equivalent database/auth/storage/AI values, and ensure the server uses HTTPS in production.

## API contract

The managed server exposes typed tRPC procedures under `/api/trpc`:

| Product operation | Procedure |
| --- | --- |
| General chat | `ai.chat` |
| Image analysis | `ai.vision` |
| Document analysis | `ai.document` |
| Voice transcription | `ai.transcribe` |
| List conversations | `conversations.list` |
| Create conversation | `conversations.create` |
| Load messages | `conversations.messages` |
| Rename conversation | `conversations.rename` |
| Delete conversation | `conversations.remove` |

This keeps the contract typed end to end in the supplied stack while providing the same server-side boundaries requested by the specification.

## Demo mode

If `BUILT_IN_FORGE_API_KEY` is empty or the provider call fails, chat, image, and document flows return a useful local response that describes what the live assistant would do. The UI labels this state as demo mode and shows a toast explaining how to enable live responses. Browser voice input/output remains available independently when supported by the browser.

## File safety

The server checks both MIME type and extension for images, documents, and audio, sanitizes storage names, rejects malformed data URIs, and enforces a 10 MB upload limit before calling storage or AI services. Uploaded bytes are stored outside the database; the database keeps metadata and storage references only.

## Architecture safety

Architecture mode is an enhancement layer, not a restriction: normal questions continue through the general assistant. Image analysis is instructed to distinguish visible facts, estimates, assumptions, and recommendations, and to recommend qualified professional verification for safety-critical structural or construction decisions.
