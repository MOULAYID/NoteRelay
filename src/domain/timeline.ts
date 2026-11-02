import type { Anchor } from "./types";
export function locate(
  anchors: Anchor[],
  time: number,
): {
  videoTime: number;
  pageUrl: string;
  sourceId: string;
  approximate: boolean;
} | null {
  const sorted = anchors.slice().sort((a, b) => a.audioTime - b.audioTime);
  let a: Anchor | undefined;
  for (const point of sorted) {
    if (point.audioTime <= time) a = point;
    else break;
  }
  if (
    !a ||
    !a.playing ||
    time - a.audioTime > 2.5 ||
    ["seeking", "waiting", "emptied"].includes(a.event)
  )
    return null;
  const next = sorted.find((p) => p.audioTime > a!.audioTime);
  if (
    next &&
    next.audioTime <= time + 0.25 &&
    (next.sourceId !== a.sourceId || next.event === "seeking")
  )
    return null;
  return {
    videoTime: a.videoTime + (time - a.audioTime) * a.rate,
    pageUrl: a.pageUrl,
    sourceId: a.sourceId,
    approximate: true,
  };
}
