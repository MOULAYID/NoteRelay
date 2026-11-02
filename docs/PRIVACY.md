# Privacy notice — NoteRelay preview

NoteRelay has no developer-operated server, analytics tracker, account system, or advertising SDK.

## Data on your device

The extension stores recorded audio, lecture title, selected source, sanitized source page URL, timing observations, transcript versions, generated notes, job state, and usage measurements in its own Chrome profile storage. Microphone device selection is not synchronized. API keys are session-only unless you explicitly select local retention.

Recordings are local-first, not necessarily local-only: starting recording alone does not upload audio when progressive processing is disabled. Enabling progressive transcription explicitly sends committed windows to Google. Clicking transcription sends saved audio. Generating notes sends transcript text and source IDs. A connection test sends a small text request. The user's Google project credentials authenticate those requests.

The extension does not attach unrelated browsing history, unrelated tabs, or microphone input in tab mode. A captured tab may itself play multiple audio sources; capture includes its mixed audio. Microphone mode can record nearby people. Use the appropriate permissions and institution rules.

## Third-party processing

Gemini requests go to `generativelanguage.googleapis.com` under the user's Google API project. Provider policies, quotas, billing, retention, region, and applicable terms govern this processing. Do not assume a free quota is available or appropriate for public distribution. Current Google terms distinguish EEA/UK/Swiss distribution and regional data-use rules. Review the linked official terms before release or use with sensitive material.

API transport uses HTTPS. NoteRelay does not claim EU-only processing, zero provider retention, automatic GDPR compliance, or an encrypted local vault. Public distribution requires a reviewed privacy notice matching the actual release.

## Control and deletion

Library can delete audio independently or delete an entire lecture. Existing exports are outside extension control. API key removal clears both local and session stores. Chrome profile removal/uninstall may remove all stored recordings; export first. Browser backups or provider retention may have separate lifecycles.

## Logs and diagnostics

No transcript, audio, request body, or key is intentionally logged. Stored processing errors are generic and sanitized. Usage export includes provider token counts, task type/status/attempts, model ID, elapsed time, and timestamps; review exports before sharing.
