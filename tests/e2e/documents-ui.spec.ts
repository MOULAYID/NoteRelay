import {
  test,
  expect,
  chromium,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { studyDocumentFlow } from "../helpers/study-flow";
test.use({ trace: "off" });
test("study document browser flow: two lectures, restart, PDF, editable backup and independent deletion", async () => {
  const profile = await mkdtemp(join(tmpdir(), "noterelay-documents-"));
  let context: BrowserContext;
  let unexpectedAPI = 0;
  const errors: string[] = [];
  const open = async (): Promise<Page> => {
    context = await chromium.launchPersistentContext(profile, {
      headless: true,
      executablePath: process.env.CHROMIUM_PATH || undefined,
      viewport: { width: 980, height: 1100 },
      args: process.env.CHROMIUM_LOW_RESOURCE
        ? [
            "--no-sandbox",
            "--single-process",
            "--no-zygote",
            "--in-process-gpu",
            "--use-gl=angle",
            "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader",
          ]
        : [],
    });
    await context.addInitScript(() => {
      const area = {
        get: async () => ({}),
        set: async () => {},
        remove: async () => {},
        setAccessLevel: async () => {},
      };
      Object.defineProperty(window, "chrome", {
        value: {
          storage: { local: area, session: area },
          runtime: {
            sendMessage: async () => ({ ok: true, active: false, level: 0 }),
          },
        },
      });
    });
    await context.route(
      "https://generativelanguage.googleapis.com/**",
      async (route) => {
        unexpectedAPI++;
        await route.abort();
      },
    );
    await context.route("https://noterelay.test/**", async (route) => {
      const path =
        new URL(route.request().url()).pathname.slice(1) || "index.html";
      if (
        !["index.html", "library.html", "ui.css"].includes(path) &&
        !/^(?:chunks\/)?[a-zA-Z0-9_-]+\.js$/.test(path)
      ) {
        await route.abort();
        return;
      }
      await route.fulfill({
        headers: {
          "Content-Security-Policy":
            "script-src 'self'; object-src 'none'; connect-src 'self' https://generativelanguage.googleapis.com",
        },
        contentType: path.endsWith(".js")
          ? "application/javascript"
          : path.endsWith(".css")
            ? "text/css"
            : "text/html",
        body: await readFile(resolve("dist", path)),
      });
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("https://noterelay.test/library.html?view=documents");
    return page;
  };
  try {
    const page = await open();
    await studyDocumentFlow(page, async () => {
      await context.close();
      return open();
    });
    expect(unexpectedAPI).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    await context!.close();
    await rm(profile, { recursive: true, force: true });
  }
});
