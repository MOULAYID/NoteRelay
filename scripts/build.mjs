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
  splitting: true,
  chunkNames: "chunks/[name]-[hash]",
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

let notices =
  "NoteRelay runtime dependency notices\n\nEmbedded Roboto font terms: see ROBOTO-LICENSE.txt.\n\n";
const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
for (const [dir, metadata] of Object.entries(lock.packages)) {
  if (!dir.startsWith("node_modules/") || metadata.dev) continue;
  let entries;
  try {
    entries = await readdir(dir);
  } catch (error) {
    if (metadata.optional) continue;
    throw error;
  }
  const pkg = JSON.parse(await readFile(`${dir}/package.json`, "utf8"));
  const licenses = entries.filter((f) =>
    /^(licen[cs]e|copying|notice)([.\-_]|$)/i.test(f),
  );
  notices += `\n===== ${pkg.name} ${pkg.version} (${pkg.license || "see package"}) =====\n`;
  if (licenses.length) {
    for (const file of licenses)
      notices += `${await readFile(`${dir}/${file}`, "utf8")}\n`;
  } else {
    // Some upstream tarballs omit a separate LICENSE; retain their published attribution and README.
    const readme = entries.find((f) => /^readme(\.|$)/i.test(f));
    notices += `Published package attribution: ${JSON.stringify(pkg.author || pkg.contributors || pkg.repository || "See upstream repository")}\n`;
    if (readme) notices += `${await readFile(`${dir}/${readme}`, "utf8")}\n`;
  }
}
await writeFile("dist/THIRD_PARTY_NOTICES.txt", notices);
