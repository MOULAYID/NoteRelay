import { CommandSchema, safeError, PlayerSchema } from "../domain/validation";
import { db } from "../storage/db";
import { getSettings, getKey } from "../storage/settings";
import { id } from "../domain/types";
import { locate } from "../domain/timeline";
let creating: Promise<void> | undefined;
let starting = false;
const engineURL = chrome.runtime.getURL("offscreen.html");
async function ensureEngine() {
  if (creating) return creating;
  creating = (async () => {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
      documentUrls: [engineURL],
    });
    if (!contexts.length) {
      await chrome.offscreen.createDocument({
        url: "offscreen.html",
        reasons: [
          chrome.offscreen.Reason.USER_MEDIA,
          chrome.offscreen.Reason.BLOBS,
        ],
        justification:
          "Record explicitly selected tab or microphone audio, persist PCM blocks, and process saved lecture audio.",
      });
    }
    await chrome.runtime.sendMessage({ target: "engine", type: "PING" });
  })().finally(() => {
    creating = undefined;
  });
  return creating;
}
const engine = (type: string, data: Record<string, unknown> = {}) =>
  chrome.runtime.sendMessage({ target: "engine", type, ...data });
const trusted = (sender: chrome.runtime.MessageSender) =>
  sender.id === chrome.runtime.id &&
  ["index.html", "library.html", "settings.html", "microphone.html"].some(
    (p) => sender.url?.split("?")[0] === chrome.runtime.getURL(p),
  );
async function start(
  source: "tab" | "microphone",
  deviceId: string | undefined,
  progressive: boolean,
) {
  if (starting) throw new Error("NR:A recording is already starting.");
  starting = true;
  try {
    await ensureEngine();
    const status = await engine("STATUS");
    if (status.active)
      throw new Error("NR:Stop the current recording before starting another.");
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    let streamId: string | undefined;
    if (source === "tab") {
      if (!tab?.id || !/^https?:/.test(tab.url ?? ""))
        throw new Error(
          "NR:Open a normal video webpage and click the NoteRelay toolbar icon first.",
        );
      streamId = await chrome.tabCapture.getMediaStreamId({
        targetTabId: tab.id,
      });
    }
    const sid = id();
    const title =
      source === "tab" ? (tab?.title ?? "Online lecture") : "Classroom lecture";
    let pageUrl: string | undefined;
    if (source === "tab" && tab?.url) {
      const u = new URL(tab.url);
      pageUrl = `${u.origin}${u.pathname}${u.hostname.endsWith("youtube.com") ? `?v=${u.searchParams.get("v") ?? ""}` : ""}`;
    }
    await db.sessions.add({
      id: sid,
      title,
      source,
      tabId: source === "tab" ? tab?.id : undefined,
      url: pageUrl,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      state: "starting",
      sampleRate: 16000,
      totalSamples: 0,
      blocks: 0,
      progressive,
    });
    const result = await engine("START", {
      sessionId: sid,
      source,
      deviceId,
      streamId,
    });
    if (!result?.ok) {
      await db.sessions.update(sid, {
        state: "error",
        error: result?.error ?? "Could not start capture.",
      });
      throw new Error(`NR:${result?.error ?? "Could not start capture."}`);
    }
    if (source === "tab" && tab?.id) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["player.js"],
        });
      } catch {
        await db.sessions.update(sid, {
          error:
            "Audio capture is active; video navigation is unavailable on this page.",
        });
      }
    }
    await chrome.action.setBadgeBackgroundColor({ color: "#d63d42" });
    await chrome.action.setBadgeText({ text: "REC" });
    return { ok: true, sessionId: sid };
  } finally {
    starting = false;
  }
}
chrome.runtime.onMessage.addListener((raw, sender, reply) => {
  if (raw?.target) return false;
  if (sender.id !== chrome.runtime.id) return false;
  if (sender.url === engineURL && raw.type === "ENGINE_CONFIG") {
    Promise.all([getKey(), getSettings()]).then(([key, settings]) =>
      reply({ key, settings }),
    );
    return true;
  }
  if (sender.url === engineURL && raw.type === "ENGINE_BADGE") {
    void chrome.action.setBadgeText({ text: raw.active ? "REC" : "" });
    reply({ ok: true });
    return false;
  }
  const parsed = CommandSchema.safeParse(raw);
  if (!parsed.success) return false;
  const command = parsed.data;
  if (command.type === "PLAYER") {
    if (!sender.tab?.id) return false;
    const tabId = sender.tab.id;
    db.sessions
      .filter((s) => s.tabId === tabId && s.state === "recording")
      .first()
      .then((s) => {
        if (s)
          void engine("ANCHOR", {
            sessionId: s.id,
            data: PlayerSchema.parse(command.data),
          }).catch(() => {});
      });
    reply({ ok: true });
    return false;
  }
  if (!trusted(sender)) {
    reply({ ok: false, error: "Untrusted extension command." });
    return false;
  }
  (async () => {
    switch (command.type) {
      case "START":
        return start(command.source, command.deviceId, command.progressive);
      case "CONTROL":
        await ensureEngine();
        return engine("CONTROL", { action: command.action });
      case "STATUS": {
        const c = await chrome.runtime.getContexts({
          contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
        });
        return c.length
          ? engine("STATUS")
          : { ok: true, active: false, level: 0 };
      }
      case "RUN_JOBS":
        await ensureEngine();
        return engine("RUN_JOBS");
      case "OPEN":
        await chrome.tabs.create({
          url: chrome.runtime.getURL(`${command.page}.html`),
        });
        return { ok: true };
      case "SEEK": {
        const s = await db.sessions.get(command.sessionId);
        if (!s || s.source !== "tab" || !s.tabId) return { ok: false };
        const anchors = await db.anchors
          .where("sessionId")
          .equals(s.id)
          .toArray();
        const found = locate(anchors, command.audioTime);
        if (!found) return { ok: false };
        try {
          const result = await chrome.tabs.sendMessage(s.tabId, {
            target: "player",
            type: "SEEK",
            time: found.videoTime,
            sourceId: found.sourceId,
          });
          if (result?.ok) await chrome.tabs.update(s.tabId, { active: true });
          return result;
        } catch {
          return { ok: false };
        }
      }
    }
  })()
    .then(reply)
    .catch((e) => reply({ ok: false, error: safeError(e) }));
  return true;
});
chrome.action.onClicked.addListener((tab) => {
  if (tab.windowId !== undefined)
    void chrome.sidePanel.open({ windowId: tab.windowId });
});
chrome.runtime.onInstalled.addListener(() => {
  void chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  void chrome.alarms.create("noterelay-jobs", { periodInMinutes: 1 });
});
chrome.runtime.onStartup.addListener(() => {
  void ensureEngine();
  void chrome.alarms.create("noterelay-jobs", { periodInMinutes: 1 });
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "noterelay-jobs")
    void db.jobs
      .filter((j) => j.status === "pending" || j.status === "running")
      .count()
      .then((n) => {
        if (n) void ensureEngine().then(() => engine("RUN_JOBS"));
      });
});
