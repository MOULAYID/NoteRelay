import { test, expect, chromium, type BrowserContext } from "@playwright/test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
let context: BrowserContext, extensionId: string, profile: string;
test.beforeEach(async () => {
  profile = await mkdtemp(join(tmpdir(), "noterelay-e2e-"));
  const extension = resolve("dist");
  context = await chromium.launchPersistentContext(profile, {
    headless: true,
    channel: process.env.CHROMIUM_PATH ? undefined : "chromium",
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: [
      ...(process.env.CHROMIUM_LOW_RESOURCE
        ? [
            "--single-process",
            "--no-zygote",
            "--in-process-gpu",
            "--use-gl=angle",
            "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader",
          ]
        : []),
      "--no-sandbox",
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
    serviceWorkers: "allow",
  });
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker", { timeout: 15000 }));
  extensionId = new URL(worker.url()).host;
});
test.afterEach(async () => {
  await context?.close();
  if (profile) await rm(profile, { recursive: true, force: true });
});
test("loads a packaged extension, settings, and library without errors", async () => {
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`chrome-extension://${extensionId}/index.html`);
  await expect(
    page.getByRole("heading", { name: "Listen. Learn. Revisit." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Library", exact: false })
    .first()
    .click();
  await expect(
    page.getByText("Your saved lectures will appear here."),
  ).toBeVisible();
  await page.goto(`chrome-extension://${extensionId}/settings.html`);
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
  expect(await page.locator("input[type=password]").inputValue()).toBe("");
  expect(errors).toEqual([]);
});
test("microphone records locally across panel closure; pause, resume, export, and restart recovery", async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/microphone.html`);
  await page.getByRole("button", { name: "Allow microphone access" }).click();
  await expect(
    page.getByText("Microphone permission granted.", { exact: false }),
  ).toBeVisible();
  await page.goto(`chrome-extension://${extensionId}/index.html`);
  await page.getByRole("button", { name: "♩ Microphone", exact: true }).click();
  await page
    .getByRole("button", { name: "● Start recording", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "Stop & save" })).toBeVisible();
  await expect(page.locator(".timer")).not.toHaveText("00:00", {
    timeout: 10000,
  });
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Resume", exact: true }),
  ).toBeVisible();
  const paused = await page.locator(".timer").textContent();
  await page.waitForTimeout(1500);
  expect(await page.locator(".timer").textContent()).toBe(paused);
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto(`chrome-extension://${extensionId}/index.html`);
  await expect(
    reopened.getByRole("button", { name: "Stop & save" }),
  ).toBeVisible();
  await reopened.getByRole("button", { name: "Stop & save" }).click();
  await expect(
    reopened.getByRole("button", { name: "● Start recording", exact: true }),
  ).toBeVisible();
  await reopened
    .getByRole("button", { name: "Library", exact: false })
    .first()
    .click();
  await expect(
    reopened.getByText("Classroom lecture", { exact: true }).first(),
  ).toBeVisible();
  const download = reopened.waitForEvent("download");
  await reopened
    .getByRole("button", { name: "Export selected WAV part" })
    .click();
  const exported = await download;
  expect(exported.suggestedFilename()).toMatch(/\.wav$/);
  const wav = await readFile((await exported.path())!);
  expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
  expect(wav.toString("ascii", 8, 12)).toBe("WAVE");
  expect(wav.byteLength).toBeGreaterThan(44);
  expect(wav.readUInt32LE(40)).toBe(wav.byteLength - 44);
  // Simulate renderer loss while capturing; reopening engine marks saved session interrupted.
  await reopened
    .getByRole("button", { name: "♩ Microphone", exact: true })
    .click();
  await reopened
    .getByRole("button", { name: "● Start recording", exact: true })
    .click();
  await expect(reopened.locator(".timer")).not.toHaveText("00:00", {
    timeout: 10000,
  });
  const sw = context.serviceWorkers()[0];
  await sw.evaluate(() => chrome.offscreen.closeDocument());
  // Trigger a new engine from trusted UI by opening a new recording. Previous session must survive.
  await reopened.reload();
  await reopened
    .getByRole("button", { name: "♩ Microphone", exact: true })
    .click();
  await reopened
    .getByRole("button", { name: "● Start recording", exact: true })
    .click();
  await expect(
    reopened.getByRole("button", { name: "Stop & save" }),
  ).toBeVisible();
  await reopened.getByRole("button", { name: "Stop & save" }).click();
  await reopened
    .getByRole("button", { name: "Library", exact: false })
    .first()
    .click();
  await expect(
    reopened.locator(".lecture-card").filter({ hasText: "interrupted" }),
  ).toHaveCount(1);
});
test("persists an API key only when requested and removes it", async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/settings.html`);
  await page.locator("input[type=password]").fill("test-not-a-real-api-key");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(
    page.getByText("Settings saved.", { exact: true }),
  ).toBeVisible();
  const storage = await page.evaluate(async () => ({
    local: await chrome.storage.local.get("apiKey"),
    session: await chrome.storage.session.get("apiKey"),
  }));
  expect(storage.local).toEqual({});
  expect(storage.session.apiKey).toBe("test-not-a-real-api-key");
  await page
    .getByRole("checkbox", { name: "Remember key on this device" })
    .check();
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        async () => (await chrome.storage.local.get("apiKey")).apiKey,
      ),
    )
    .toBe("test-not-a-real-api-key");
  await page.getByRole("button", { name: "Remove key", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        async () => (await chrome.storage.local.get("apiKey")).apiKey,
      ),
    )
    .toBeUndefined();
});
