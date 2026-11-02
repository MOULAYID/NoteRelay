# Official implementation references

Reviewed 2026-11-02. Availability and terms may change; implementation compatibility must be validated against the selected model and browser.

- [Chrome tab/audio capture](https://developer.chrome.com/docs/extensions/how-to/web-platform/screen-capture): stream-ID transfer to offscreen documents and user invocation.
- [Offscreen API](https://developer.chrome.com/docs/extensions/reference/api/offscreen): DOM/audio context and runtime messaging restrictions.
- [Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel).
- [Extension storage and cookies](https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies): IndexedDB and unlimitedStorage.
- [MediaStream Recording specification](https://w3c.github.io/mediacapture-record/): individual timeslice blobs need not be independently playable.
- [Gemini audio understanding](https://ai.google.dev/gemini-api/docs/audio): supported audio input and general analysis.
- [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output): JSON structure is not a factuality guarantee.
- [Gemini dedicated transcription](https://ai.google.dev/gemini-api/docs/transcribe): alternative protocol, not the current adapter.
- [Gemini Live transcription](https://ai.google.dev/gemini-api/docs/live-api/live-transcribe): future adapter.
- [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) and [pricing](https://ai.google.dev/gemini-api/docs/pricing): use project-specific quotas, not a hardcoded free-hour promise.
- [Gemini terms](https://ai.google.dev/gemini-api/terms): regional distribution/data processing rules.
- [HTML media seeking](https://html.spec.whatwg.org/multipage/media.html#dom-media-currenttime).
- [Chrome extension E2E testing](https://developer.chrome.com/docs/extensions/how-to/test/end-to-end-testing).
- [Chrome Web Store policies](https://developer.chrome.com/docs/webstore/program-policies/policies/): review before submission.

Existing project's MIT LICENSE is preserved. No third-party sample application source was copied into this implementation. Runtime libraries retain their licenses; esbuild emits available legal comments into the bundle. Review upstream dependency LICENSE files for distribution notices.
