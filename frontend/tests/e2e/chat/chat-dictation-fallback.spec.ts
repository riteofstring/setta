import { expect, test } from "@playwright/test";
import {
  cleanupIsolatedProject,
  ensureAppReady,
  ensureManagedChatEngine,
  openIsolatedProject,
  setOverviewTab,
} from "../helpers";

test("project chat falls back to browser dictation when provider capture fails in auto mode", async ({
  page,
}) => {
  // Force provider capture to fail while browser speech recognition remains available.
  await page.addInitScript(() => {
    class MockSpeechRecognition {
      continuous = false;
      interimResults = false;
      lang = "en-US";
      onresult: ((event: unknown) => void) | null = null;
      onerror: ((event: { error?: string }) => void) | null = null;
      onend: (() => void) | null = null;

      start() {}

      stop() {
        if (this.onend) {
          this.onend();
        }
      }
    }

    class MockMediaRecorder {
      static isTypeSupported(_mimeType: string) {
        return true;
      }

      mimeType = "audio/webm";
      state = "inactive";
      ondataavailable: ((event: { data?: Blob }) => void) | null = null;
      onerror: (() => void) | null = null;
      onstop: (() => void) | null = null;

      start() {
        this.state = "recording";
      }

      stop() {
        this.state = "inactive";
        if (this.onstop) {
          this.onstop();
        }
      }
    }

    Object.defineProperty(window, "webkitSpeechRecognition", {
      value: MockSpeechRecognition,
      configurable: true,
    });
    Object.defineProperty(window, "MediaRecorder", {
      value: MockMediaRecorder,
      configurable: true,
    });
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: () => Promise.reject(new Error("denied")),
      },
      configurable: true,
    });
  });

  await setOverviewTab(page, "ProjectAIChat");
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  const engineCleanup = await ensureManagedChatEngine(page);

  try {
    await page.reload();
    await page.waitForSelector(".react-flow__pane");

    const overviewPane = page.locator("#OverviewPane");
    await expect(
      overviewPane.getByRole("heading", { name: "Project AI Chat" }),
    ).toBeVisible();

    const micButton = overviewPane.getByRole("button", { name: "Mic" });
    await expect(micButton).toBeVisible();
    await micButton.click();

    // Auto mode should switch to browser dictation instead of surfacing provider denial.
    await expect(
      overviewPane.getByRole("button", { name: "Stop Mic" }),
    ).toBeVisible();
    await expect(overviewPane.getByText("Listening...")).toBeVisible();
    await expect(
      overviewPane.getByText("Microphone access was denied."),
    ).toHaveCount(0);
  } finally {
    await engineCleanup();
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project chat releases provider mic stream when recorder start fails", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "SpeechRecognition", {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(window, "webkitSpeechRecognition", {
      value: undefined,
      configurable: true,
    });

    class MockMediaRecorder {
      static isTypeSupported(_mimeType: string) {
        return true;
      }

      mimeType = "audio/webm";
      state = "inactive";
      ondataavailable: ((event: { data?: Blob }) => void) | null = null;
      onerror: (() => void) | null = null;
      onstop: (() => void) | null = null;

      start() {
        throw new Error("start failed");
      }

      stop() {
        this.state = "inactive";
      }
    }

    let stopCount = 0;
    const audioTrack = {
      stop: () => {
        stopCount += 1;
      },
    };

    Object.defineProperty(window, "MediaRecorder", {
      value: MockMediaRecorder,
      configurable: true,
    });
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: () =>
          Promise.resolve({
            getTracks: () => [audioTrack],
          }),
      },
      configurable: true,
    });
    (window as Window & { __providerTrackStopCount?: () => number }).__providerTrackStopCount =
      () => stopCount;
  });

  await setOverviewTab(page, "ProjectAIChat");
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  const engineCleanup = await ensureManagedChatEngine(page);

  try {
    await page.reload();
    await page.waitForSelector(".react-flow__pane");

    const overviewPane = page.locator("#OverviewPane");
    await expect(
      overviewPane.getByRole("heading", { name: "Project AI Chat" }),
    ).toBeVisible();

    const micButton = overviewPane.getByRole("button", { name: "Mic" });
    await expect(micButton).toBeVisible();
    await micButton.click();

    await expect(overviewPane.getByText("Microphone access was denied.")).toBeVisible();
    await expect.poll(async () => {
      return await page.evaluate(() => {
        const reader = (
          window as Window & { __providerTrackStopCount?: () => number }
        ).__providerTrackStopCount;
        return typeof reader === "function" ? reader() : 0;
      });
    }).toBe(1);
  } finally {
    await engineCleanup();
    await cleanupIsolatedProject(page, projectContext);
  }
});
