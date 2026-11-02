# Verification evidence and benchmark protocol

## Checks executed in the implementation environment (2026-11-02)

| Check                                       | Result / scope                                                                                                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TypeScript strict check                     | Passed                                                                                                                                                                         |
| ESLint                                      | Passed                                                                                                                                                                         |
| Vitest                                      | 21 tests passed across audio/timing, IndexedDB/job recovery, and mocked-provider integration                                                                                   |
| Production bundle                           | Built successfully                                                                                                                                                             |
| Browser-rendered UI                         | Passed in Chromium 153 headless shell with explicit mocked Chrome APIs; navigation, microphone selector, empty notes, Library, settings, no page errors                        |
| Visual review                               | Actual bundled UI screenshot reviewed at 420 px; see media/interface-preview.png                                                                                               |
| Benchmark harness                           | Executed on intentionally synthetic English/French text pairs as a calculation self-check; not a model-quality result                                                          |
| Full extension / real capture               | Not verified locally: standard full Chrome download returned invalid/truncated archive; alternative available headless-shell build did not expose the extension service worker |
| Live Gemini                                 | Not executed: no user API key supplied                                                                                                                                         |
| Five-minute / one-hour / three-hour capture | Not executed; no endurance claim                                                                                                                                               |
| YouTube/Coursera/Udemy compatibility        | Not verified                                                                                                                                                                   |

The UI test does **not** prove the offscreen engine, microphone/tab capture, Chrome permissions, or provider access work in a user's Chrome. The extension E2E suite is included for full Chromium/Chrome, and CI attempts it. Check that workflow's actual result before treating it as evidence. A browser download failure or missing extension support is not a passing test.

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
