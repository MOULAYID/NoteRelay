# Contributing to NoteRelay

Use Node 22+ and `npm ci`. Run `npm run check` before a pull request. Browser tests need `npx playwright install --with-deps chromium`; run `npm run test:e2e`. Package with `npm run package` (Python 3).

Keep changes focused. Preserve the independent recording/transcription/notes stages. New providers implement the interfaces in `src/providers/gemini.ts` or extract them to a shared module without changing stored provenance. Add storage migrations and recovery tests for schema changes.

Never commit API keys, `.env` secrets, personal recordings, private transcripts, generated performance claims, or unlicensed course material. Supply synthetic fixtures or clearly licensed/self-created samples. Do not use mocked provider success as evidence of real provider quality.

Bug reports should include Chrome/OS version, extension version, source mode, steps, sanitized status, and whether saved WAV plays. Do not attach private source content by default.

Use clear commit messages and describe behavior, verification, and remaining limitations. Changes must remain compatible with the MIT project license while preserving third-party notices.
