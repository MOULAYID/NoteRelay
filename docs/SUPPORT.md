# Supported environments and limitations

- Desktop Chrome MV3; declared minimum 116. Test current stable Chrome before distribution. Firefox, mobile, and Safari are not supported targets.
- One source at a time: selected tab **or** microphone. No system-audio capture and no simultaneous mixed tab/microphone mode.
- Tab capture starts from explicit user interaction. Open the lecture and click the toolbar icon before starting. If Chrome rejects capture after switching tabs, invoke the toolbar on the intended tab again.
- Microphone permission must be granted on the dedicated setup page. Offscreen documents cannot provide an ordinary visible permission workflow.
- Closing the panel does not stop the offscreen engine. Closing Chrome stops capture; committed audio remains. Device/disk failure and uninstall are outside recovery guarantees.
- Silence does not stop capture. Video pauses are recorded as silence; recording Pause excludes time. Input level is a rolling block RMS indicator, not a calibrated sound-level meter.
- Gemini key and compatible model access are needed only for cloud processing. Recording works without a key or internet. Defaults may change availability; API connection and quality have to be tested with your own account. After changing models, choose Create new transcription version to process retained audio with the new settings; ordinary retries preserve the original model.
- Progressive transcription means 30-second requests, not true streaming; final text may lag. There are no interim speech hypotheses. Failed windows can retry; silence can yield no transcript text.
- Generative ASR timestamps and video mapping are approximate. No measured accuracy guarantee is published.
- Generic top-frame HTML5 video/audio observation is implemented. Normal YouTube HTML5 media may work but is not yet certified across ads, sign-in states, and player variants. Coursera/Udemy frame integrations are not verified. Original-source links are not backups of a course.
- Unsupported, missing, ambiguous, or stale video mapping falls back to a one-minute saved-audio excerpt. Deleting audio disables that fallback.
- Audio-only notes cannot recover unseen slides, diagrams, formulas, demonstrations, or silently displayed code. AI explanations and references need human review.
- Transcript edits require completed processing. Edits are full snapshots; original notes keep their version. No bookmarks, collection management, translation workflow, or cross-lecture search yet.
- Export audio as bounded ten-minute WAV parts. A combined compressed multi-hour audio download, audio-file import, and Notion export are not implemented. Study document PDF export is available separately from the Documents view.
- Export JSON contains source URLs, transcripts, and notes, but never the key or raw audio. Treat exported lecture content as private if appropriate.
- Local storage is not encrypted against someone controlling your device/profile. Export independent copies before uninstalling or switching profiles.

- Study documents use local saved chapter snapshots with PDF and editable JSON exports. See [the document guide](STUDY_DOCUMENTS.md). Arbitrary external PDF editing/import and full LaTeX compilation are not supported.
