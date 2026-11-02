# Security

Do not post credentials, private recordings, transcripts, or raw provider responses in public issues. For security-sensitive reports, use GitHub private vulnerability reporting if enabled; otherwise contact the maintainer privately before disclosing details.

## Trust boundaries

Webpage/media content and AI output are untrusted. Only user-invoked top-frame player observation is injected. The extension validates runtime commands, checks sender identity/context, checks the captured tab for player events, and restricts seek operations to the observed media identity and seekable range. It exposes no external runtime API or page-main-world bridge.

Study outputs are schema-validated, source IDs are checked, and plain text is rendered through React escaping. There is no raw HTML/Markdown HTML execution or dynamic evaluation of AI responses. A transcript prompt-injection attempt can still affect output quality; source review remains necessary.

## Credentials

Never bundle shared API keys. `chrome.storage.local` and `.session` are restricted to trusted extension contexts; no credential is sent to the player. Session storage is preferred. Local retention is opt-in and is not encryption. API requests use the header, not a URL query string. Generic errors avoid reflecting provider bodies or keys.

## Permissions

`tabCapture`: selected tab; `offscreen`: background audio and saved-file processing; `sidePanel`: interface; `storage`: key/settings; `activeTab`/`scripting`: user-invoked player adapter; `unlimitedStorage`: long recordings; `alarms`: resume pending work. The only API host permission is Google's Generative Language endpoint. No blanket webpage host access is requested.

## Supply chain and release

Dependencies are pinned by lockfile. Executable code is bundled locally; no CDN scripts. Review dependencies and notices before a release. CI requires no Gemini secret. Do not claim formal penetration testing or Store approval from these controls alone.
