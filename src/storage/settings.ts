import { DEFAULT_SETTINGS, type Settings } from "../domain/types";
export async function getSettings(): Promise<Settings> {
  const { settings } = await chrome.storage.local.get<{
    settings?: Partial<Settings>;
  }>("settings");
  return { ...DEFAULT_SETTINGS, ...settings };
}
export async function saveSettings(settings: Settings, key?: string) {
  await chrome.storage.local.setAccessLevel({
    accessLevel: "TRUSTED_CONTEXTS",
  });
  await chrome.storage.session.setAccessLevel({
    accessLevel: "TRUSTED_CONTEXTS",
  });
  await chrome.storage.local.set({ settings });
  if (key !== undefined) {
    if (settings.rememberKey) {
      await chrome.storage.local.set({ apiKey: key });
      await chrome.storage.session.remove("apiKey");
    } else {
      await chrome.storage.session.set({ apiKey: key });
      await chrome.storage.local.remove("apiKey");
    }
  } else {
    const existing = await getKeyFromEither();
    if (existing) {
      await (
        settings.rememberKey ? chrome.storage.local : chrome.storage.session
      ).set({ apiKey: existing });
      await (
        settings.rememberKey ? chrome.storage.session : chrome.storage.local
      ).remove("apiKey");
    }
  }
}
async function getKeyFromEither() {
  const session = await chrome.storage.session.get<{ apiKey?: string }>(
    "apiKey",
  );
  if (session.apiKey) return session.apiKey;
  const local = await chrome.storage.local.get<{ apiKey?: string }>("apiKey");
  return local.apiKey ?? "";
}
export async function getKey(): Promise<string> {
  const s = await chrome.storage.session.get<{ apiKey?: string }>("apiKey");
  if (s.apiKey) return s.apiKey;
  const l = await chrome.storage.local.get<{
    settings?: Settings;
    apiKey?: string;
  }>(["settings", "apiKey"]);
  return l.settings?.rememberKey ? (l.apiKey ?? "") : "";
}
export async function deleteKey() {
  await chrome.storage.session.remove("apiKey");
  await chrome.storage.local.remove("apiKey");
}
