import { test, expect, chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
test("browser-rendered interface: navigation and microphone settings with explicit Chrome API mocks", async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || undefined,
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
  const page = await browser.newPage({ viewport: { width: 420, height: 950 } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const stores: {
      local: Record<string, unknown>;
      session: Record<string, unknown>;
    } = { local: {}, session: {} };
    const area = (name: "local" | "session") => ({
      get: async (keys: string | string[]) =>
        Object.fromEntries(
          (Array.isArray(keys) ? keys : [keys])
            .filter((k) => k in stores[name])
            .map((k) => [k, stores[name][k]]),
        ),
      set: async (values: Record<string, unknown>) =>
        Object.assign(stores[name], values),
      remove: async (key: string) => {
        delete stores[name][key];
      },
      setAccessLevel: async () => {},
    });
    Object.defineProperty(window, "chrome", {
      value: {
        storage: { local: area("local"), session: area("session") },
        runtime: {
          sendMessage: async () => ({ ok: true, active: false, level: 0 }),
        },
      },
    });
  });
  await page.route("https://noterelay.test/**", async (route) => {
    const path =
      new URL(route.request().url()).pathname.slice(1) || "index.html";
    if (
      ![
        "index.html",
        "library.html",
        "settings.html",
        "ui.js",
        "ui.css",
      ].includes(path) &&
      !/^(?:chunks\/)?[a-zA-Z0-9_-]+\.js$/.test(path)
    ) {
      await route.abort();
      return;
    }
    const body = await readFile(resolve("dist", path));
    await route.fulfill({
      status: 200,
      contentType: path.endsWith(".js")
        ? "application/javascript"
        : path.endsWith(".css")
          ? "text/css"
          : "text/html",
      body,
    });
  });
  await page.goto("https://noterelay.test/index.html");
  await expect(
    page.getByRole("heading", { name: "Listen. Learn. Revisit." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "♩ Microphone", exact: true }).click();
  await expect(page.getByLabel("Input device")).toBeVisible();
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "✧ Generate notes" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Library", exact: false })
    .first()
    .click();
  await expect(
    page.getByText("Your saved lectures will appear here."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Transcript", exact: true }).click();
  await page.screenshot({
    path: "test-results/ui-empty-preview.png",
    fullPage: true,
  });
  await page.goto("https://noterelay.test/settings.html");
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("API key", { exact: true })).toHaveAttribute(
    "type",
    "password",
  );
  expect(errors).toEqual([]);
  await browser.close();
});
