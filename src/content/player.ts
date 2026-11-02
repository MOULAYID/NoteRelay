// Injected only after a user grants activeTab. No page-main-world bridge or external messages.
(() => {
  const host = globalThis as typeof globalThis & {
    __noteRelayPlayer?: boolean;
  };
  if (host.__noteRelayPlayer) return;
  host.__noteRelayPlayer = true;
  let current: HTMLMediaElement | undefined;
  let last = "";
  const clean = (value: string) => {
    try {
      const u = new URL(value);
      if (u.hostname.endsWith("youtube.com"))
        return `${u.origin}${u.pathname}?v=${u.searchParams.get("v") ?? ""}`;
      return `${u.origin}${u.pathname}`;
    } catch {
      return "";
    }
  };
  const identity = (v: HTMLMediaElement) =>
    `${clean(location.href)}|${clean(v.currentSrc)}`;
  function sample(event = "tick") {
    const videos = Array.from(document.querySelectorAll("video,audio")).filter(
      (v) => v instanceof HTMLMediaElement,
    ) as HTMLMediaElement[];
    const visible = videos.filter((v) => v.getClientRects().length > 0);
    const playing = visible.filter((v) => !v.paused);
    // Ambiguous multiple playing players: disable mapping rather than seek the wrong video.
    const selected =
      playing.length === 1
        ? playing[0]
        : playing.length === 0 && visible.length === 1
          ? visible[0]
          : undefined;
    if (!selected) return;
    if (current !== selected) {
      current = selected;
      for (const name of [
        "play",
        "pause",
        "seeking",
        "seeked",
        "ratechange",
        "waiting",
        "playing",
        "emptied",
        "ended",
      ])
        selected.addEventListener(name, () => sample(name));
    }
    const sourceId = identity(selected);
    if (sourceId !== last) {
      event = "sourcechange";
      last = sourceId;
    }
    void chrome.runtime
      .sendMessage({
        type: "PLAYER",
        data: {
          videoTime: selected.currentTime,
          sourceId,
          pageUrl: clean(location.href),
          rate: selected.playbackRate,
          playing:
            !selected.paused && !selected.seeking && selected.readyState >= 3,
          event,
          observedAt: Date.now(),
        },
      })
      .catch(() => {});
  }
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (sender.id !== chrome.runtime.id || message?.target !== "player") return;
    if (
      message.type === "SEEK" &&
      current &&
      identity(current) === message.sourceId &&
      Number.isFinite(message.time)
    ) {
      const time = Number(message.time);
      const ranges = current.seekable;
      let valid = false;
      for (let i = 0; i < ranges.length; i++)
        if (time >= ranges.start(i) && time <= ranges.end(i)) valid = true;
      if (valid) {
        current.currentTime = time;
        reply({ ok: true });
      } else reply({ ok: false });
    } else reply({ ok: false });
    return false;
  });
  sample();
  setInterval(() => sample(), 1000);
})();
