# Delivery plan and acceptance criteria

| Milestone                | Dependencies / difficulty               | Deliverable and acceptance                                                                          |
| ------------------------ | --------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Capture foundation       | Chrome MV3, offscreen, Web Audio / high | Both source modes; saved blocks survive interface closure; pause excludes time; source ends safely  |
| Local recovery           | Dexie / high                            | Saved-through position advances only after commit; interrupted session can export playable portions |
| Provider workflow        | Capture + Gemini / medium               | Saved-audio request produces validated persistent transcript; failed calls keep audio               |
| Study outputs            | Transcript schema / medium              | Two note outputs from one transcript; valid source IDs; no second audio upload                      |
| Navigation and editing   | Player observations / high              | Supported seek or saved-audio fallback; edit appends transcript version; old notes remain unchanged |
| Usability                | Stable stores / medium                  | Narrow side panel, Library, device setup, exports, explicit upload indicators, keyboard access      |
| Verification/publication | All above / high                        | Automated checks, packaged extension, reproduction guide, limitations, benchmark harness, GitHub CI |

The initial implementation includes the above code paths. Consult TESTING.md for which acceptance criteria have actually been exercised; implementation is not equivalent to verification.

## Next evidence-driven work

1. Live-key English/French/mixed-language evaluation on self-recorded or licensed audio.
2. Manual toolbar/tab-capture verification on YouTube and a generic HTML5 player, including seeks, speed changes, ads, buffering, and navigation.
3. Five-minute, one-hour, and three-hour real-browser endurance runs; memory, disk, recovery boundary, device disconnection, and storage-pressure measurement.
4. Compare GenerateContent to dedicated Transcribe and Live adapters. Add streaming only with measured latency, accuracy, and rotation recovery.
5. Overlap-based boundary reconciliation, local Whisper provider, course collections, bookmarks, cross-lecture search.
6. Explicit audio compression choice after storage and crash-recovery benchmarks.
7. Chrome Web Store privacy/distribution review and only then a Store submission.

Cloud accounts, billing, collaboration, Notion integration, PDF generation, and slide OCR are deliberately postponed. The personal-key prototype must not imply a hosted SaaS or a public distribution approval.
