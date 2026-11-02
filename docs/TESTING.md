# Verification evidence and benchmark protocol

## Checks executed in the implementation environment (2026-11-02)

| Check                                       | Result / scope                                                                                                                                                                                                    |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript strict check                     | Passed                                                                                                                                                                                                            |
| ESLint                                      | Passed                                                                                                                                                                                                            |
| Vitest                                      | 22 tests passed across audio/timing, IndexedDB/job recovery, and mocked-provider integration                                                                                                                      |
| Production bundle                           | Built successfully                                                                                                                                                                                                |
| Browser-rendered UI                         | Passed in Chromium 153 headless shell with explicit mocked Chrome APIs; navigation, microphone selector, empty notes, Library, settings, no page errors                                                           |
| Visual review                               | Actual bundled UI screenshot reviewed at 420 px; see media/interface-preview.png                                                                                                                                  |
| Benchmark harness                           | Executed on intentionally synthetic English/French text pairs as a calculation self-check; not a model-quality result                                                                                             |
| Full extension locally                      | Local full Chrome download failed; alternative headless shell did not expose extensions                                                                                                                           |
| Full extension in GitHub CI                 | **Passed in Chrome for Testing 156**: packaged extension loads, synthetic microphone capture, pause/resume, interface closure, WAV export, engine-loss recovery, key retention/removal; four browser tests passed |
| Live Gemini                                 | Not executed: no user API key supplied                                                                                                                                                                            |
| Five-minute / one-hour / three-hour capture | Not executed; no endurance claim                                                                                                                                                                                  |
| YouTube/Coursera/Udemy compatibility        | Not verified                                                                                                                                                                                                      |

The locally mocked UI test does **not** prove capture. The full extension suite subsequently passed in [GitHub CI](https://github.com/MOULAYID/NoteRelay/actions/runs/41497219530), using a synthetic microphone and actual extension/offscreen APIs. This does not verify a physical microphone, real toolbar-driven tab capture, long recordings, real Google API access, or a full browser/OS restart. The recovery test terminates and recreates the offscreen engine. A browser download failure is not a passing test.

## Deterministic coverage

- Atomic ordered audio commits, duplicate writes, cross-block reconstruction.
- Recovery preserves committed blocks; it does not resume capture without user action.
- Active/running-task deletion protection; independent audio/transcript deletion.
- Stable transcription jobs, global leases, retry exhaustion, transcript completeness.
- Stored transcript → two notes outputs with no additional audio request.
- Provider 429 retry, invalid/out-of-range timestamps, truncated JSON, fabricated source IDs.
- PCM clipping/endian encoding and WAV size/sample-rate header.
- Video offset, speed, rewind, stale/paused/seeking/buffering mapping rejection.
- Command validation and sanitized errors.

## Real-browser suite

`npm run test:e2e` uses full Chromium (`channel: chromium`) for extension tests and a fake microphone so no personal recording is required. It checks packaged loading, microphone permission, capture/pause/resume/interface closure, WAV download, engine-loss recovery, and key retention/removal. These tests do not exercise a physical microphone or toolbar-driven real tab capture. Install a full browser using `npx playwright install --with-deps chromium`.

`CHROMIUM_PATH` selects a browser executable. `CHROMIUM_LOW_RESOURCE=1` is a constrained test-environment option; a headless shell is suitable for the explicitly mocked UI test but may not load extensions. Never interpret that UI test as extension-capture verification.

## Manual release checklist

Use your own/appropriately licensed material. Record actual OS, Chrome version, hardware, device, sample rate, source, language, provider/model, settings, and date.

1. Record 5 minutes in each source mode; independently replay exports.
2. Pause/resume and close/reopen the panel. Confirm no accidental source switch.
3. Unplug the microphone, close the source tab, navigate, and restart Chrome. Measure saved audio boundary and missing tail.
4. Disconnect network and simulate exhausted quota; recording must continue. Retry only missing windows.
5. Verify source offset, pause, 0.75×/1×/1.5×/2×, rewind, forward seek, buffering, ads, and player changes. Score mapping separately from ASR timestamps.
6. Test one-hour and three-hour recordings. Sample renderer/process memory and disk growth; evaluate write backlog and audio continuity. Do not infer bounded process memory solely from bounded block code.
7. Force low-storage conditions in a disposable profile. Confirm explicit stop/error and preservation of prior committed data.
8. Compare English, French, mixed language, accents, distant speech, background noise, numbers, and technical terminology.
9. Edit transcript, regenerate notes, compare version provenance, delete audio, and verify notes still work.
10. Run a release dependency/security/Store-policy review.

## Evaluation corpus and measurements

`benchmarks/references/recording-scripts.md` contains original scripts. Record clean/distant/noisy variants and manually verify verbatim references from actual audio. Keep a held-out set separate from prompt tuning. Include silence as a separate hallucination test. Never publish private course audio.

For each model, use identical audio, record processing settings, and retain raw predictions. `benchmarks/evaluate.py` accepts paired reference/hypothesis text and optional manually measured timing errors. It reports WER/CER and timestamp median/p95, with disclosed normalization. Report language/condition breakdowns and sample sizes; do not hide deletions behind aggressive normalization. Domain terms and number accuracy require a separate annotated checklist.

```bash
python3 benchmarks/evaluate.py your-pairs.json --output benchmarks/results/run.json
```

For summary evaluation, prepare an evidence-linked checklist of essential claims. Blind reviewers to the model. Score supported claims, concept coverage, unsupported claims by severity, definition/number fidelity, reference correctness, and usefulness. Use automatic source-ID checks as structural evidence only. LLM judges are supplemental and should be calibrated against human review.

Usage export contains observed provider tokens and client request elapsed time, including successful outputs' reported thinking tokens. Failed/ambiguous requests may still incur cost and are not included as successful usage events. Calculate costs using the exact model's dated prices; do not compare audio and text solely by nominal per-token price. Report retries and overlapping input separately.

Suggested results table: model/provider, corpus/condition, WER, CER, term accuracy, timestamp p95, transcript p50/p95 latency, real-time factor, successful/failed tasks, tokens, measured cost/lecture hour, memory peak, disk/hour, recovery successes/attempts. Leave cells unmeasured until evidence exists.

## 0.1.1 regression checks

The model-access/error-diagnostic update passes 29 local unit/integration tests, strict type checking, linting, and production packaging. Added coverage distinguishes HTTP 400 invalid keys, HTTP 404 unavailable models, schema rejection, billing eligibility, and arbitrary secret-bearing server payloads. Model listing pagination/filtering and synthetic-silence audio testing are covered without live credentials. The browser suite adds a mocked Google endpoint test for model discovery and safely rendered HTTP errors.

No real Google key was supplied to the implementation environment, so the screenshot’s exact failed HTTP response cannot be reconstructed. Gemini 2.5 new-project restrictions are a plausible explanation, not a confirmed account-specific diagnosis. The update preserves explicit model choice rather than silently substituting a provider/model or deleting a recording.

## 0.2.0 study document verification

- **37 unit/integration tests pass** locally, including v1 → v2 migration preserving legacy audio, notes, transcripts and jobs; portable backup import; chapter ordering/duplicate handling; snapshot independence; conflict protection; and safe source/PDF definitions.
- A real Chromium browser workflow with explicit mocked Chrome APIs creates a document from lecture 1, appends lecture 2, renames/reorders chapters, closes/restarts the browser profile, reopens the document, downloads PDF and JSON, imports an independent copy, removes a chapter/document, and verifies original notes remain. It passed locally without a Gemini request. The same flow is included in the full-extension Chrome suite.
- **PDF QA:** generated one seven-page A4 fixture containing three chapters, a long French title, extended paragraphs, a long URL/identifier, a table, lists, code, and English/French/Greek text. All seven pages were rendered with Poppler and visually inspected. pypdf extraction verified accents (Électricité, fréquence, cœur, œuvre, naïve), μ/Δ/≤, the final numbered example, and chapter 3. Link annotations included valid video timestamps and no file/javascript/extension recording URLs. pdfplumber found no visible glyphs outside the checked page boundaries.
- The browser download path is tested. The optional OS-native Save PDF as chooser/overwrite dialog is not automated; it has a normal download fallback. Universal emoji/scripts, full LaTeX, image embedding, arbitrary PDF reconstruction, and very large collection performance are not claimed.

Reproduce the PDF fixture locally:

```bash
npx esbuild tests/helpers/generate-study-pdf.ts --bundle --platform=node --format=cjs --outfile=tmp/pdfs/generate.cjs
node tmp/pdfs/generate.cjs
pdftoppm -r 85 -png tmp/pdfs/study-document-qa.pdf tmp/pdfs/page
pdftotext -layout tmp/pdfs/study-document-qa.pdf tmp/pdfs/study-document-qa.txt
```

The fixture contains original synthetic study material, not a private course recording. Its generated PDF is a QA intermediate rather than an asserted ASR-quality benchmark.
