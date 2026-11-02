import { build, context } from "esbuild";
import { mkdir, cp, writeFile, rm, readFile, readdir } from "node:fs/promises";
await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await cp("public", "dist", { recursive: true });
for (const page of ["index", "library", "settings", "microphone"]) {
  await writeFile(
    `dist/${page}.html`,
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NoteRelay</title><link rel="stylesheet" href="ui.css"></head><body><div id="root"></div><script type="module" src="ui.js"></script></body></html>`,
  );
}
await writeFile(
  "dist/offscreen.html",
  '<!doctype html><html><head><meta charset="utf-8"><title>NoteRelay audio engine</title></head><body><script type="module" src="offscreen.js"></script></body></html>',
);
const options = {
  entryPoints: {
    background: "src/background/index.ts",
    offscreen: "src/offscreen/index.ts",
    ui: "src/ui/index.tsx",
    player: "src/content/player.ts",
    worklet: "src/audio/worklet.ts",
  },
  bundle: true,
  outdir: "dist",
  format: "esm",
  target: "chrome116",
  sourcemap: false,
  legalComments: "eof",
  minify: !process.argv.includes("--watch"),
};
if (process.argv.includes("--watch")) {
  const ctx = await context(options);
  await ctx.watch();
} else await build(options);

let notices = "NoteRelay runtime dependency notices\n\n";
for (const name of ["react", "react-dom", "scheduler", "dexie", "zod"]) {
  const dir = `node_modules/${name}`;
  const entries = await readdir(dir);
  const license = entries.find((f) => /^license(\.|$)/i.test(f));
  if (!license) throw new Error(`Missing runtime license: ${name}`);
  notices += `\n===== ${name} =====\n${await readFile(`${dir}/${license}`, "utf8")}\n`;
}
await writeFile("dist/THIRD_PARTY_NOTICES.txt", notices);
