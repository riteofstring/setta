import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  allowExpectedApiError,
  cleanupIsolatedProject,
  createChatSection,
  ensureAppReady,
  ensureManagedChatEngine,
  openIsolatedProject,
  postBackend,
  setOverviewTab,
} from "../helpers";

const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";

async function configureProjectChatTranscriptionProfile({
  page,
  dictationMode,
}: {
  page: Page;
  dictationMode: "auto" | "provider";
}): Promise<() => Promise<void>> {
  const llmConfigResponse = await page.request.get(
    `${BACKEND_ORIGIN}/api/llm/config`,
  );
  if (!llmConfigResponse.ok()) {
    throw new Error(
      "Failed to load LLM config for transcription profile setup.",
    );
  }
  const llmConfigPayload = (await llmConfigResponse.json()) as {
    default_config_id?: string | null;
    configs?: Record<string, unknown>;
  };
  const defaultConfigId =
    typeof llmConfigPayload.default_config_id === "string" &&
    llmConfigPayload.default_config_id.length > 0
      ? llmConfigPayload.default_config_id
      : Object.keys(llmConfigPayload.configs ?? {})[0] ?? null;
  if (!defaultConfigId) {
    throw new Error(
      "No LLM config id available for transcription profile setup.",
    );
  }
  const createdProfile = await postBackend<{ id: string }>(
    page,
    "/createTranscriptionProfile",
    {
      name: `E2E Transcription ${Date.now()}`,
      transcriptionLlmConfigId: defaultConfigId,
      transportMode: "auto",
      chunkMs: 1200,
      language: null,
    },
  );
  if (!createdProfile?.id) {
    throw new Error(
      "Failed to create transcription profile for dictation tests.",
    );
  }
  await page.addInitScript(
    ({ profileId, mode }) => {
      const key = "setta_ai_data";
      let payload: { state: Record<string, unknown>; version: number } = {
        state: {},
        version: 0,
      };
      const raw = localStorage.getItem(key);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as {
            state?: unknown;
            version?: unknown;
          };
          payload = {
            state:
              parsed && typeof parsed.state === "object" && parsed.state
                ? (parsed.state as Record<string, unknown>)
                : {},
            version: typeof parsed?.version === "number" ? parsed.version : 0,
          };
        } catch {
          payload = { state: {}, version: 0 };
        }
      }
      payload.state = {
        ...payload.state,
        projectChatDictationMode: mode,
        projectChatTranscriptionProfileId: profileId,
      };
      localStorage.setItem(key, JSON.stringify(payload));
    },
    { profileId: createdProfile.id, mode: dictationMode },
  );
  return async () => {
    try {
      await postBackend(page, "/deleteTranscriptionProfile", {
        profileId: createdProfile.id,
      });
    } catch {
      // Best effort cleanup for per-test transcription profiles.
    }
  };
}

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
  const transcriptionCleanup = await configureProjectChatTranscriptionProfile({
    page,
    dictationMode: "auto",
  });
  await page.route(
    `${BACKEND_ORIGIN}/api/startTranscriptionSession`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          sessionId: "session-auto-fallback-1",
          resolvedTransportMode: "file",
          chunkMs: 0,
        }),
      });
    },
  );

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
    await transcriptionCleanup();
    await engineCleanup();
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project chat stops provider dictation immediately when append fails", async ({
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

    type MockAudioProcessEvent = {
      inputBuffer: { getChannelData: (channel: number) => Float32Array };
    };
    type MockScriptProcessorNode = {
      onaudioprocess: ((event: MockAudioProcessEvent) => void) | null;
      connect: () => void;
      disconnect: () => void;
      __intervalId: ReturnType<typeof setInterval> | null;
    };

    class MockAudioContext {
      sampleRate = 24_000;
      destination = {};
      private _processors: MockScriptProcessorNode[] = [];

      async resume() {}

      async close() {
        for (const processor of this._processors) {
          if (processor.__intervalId !== null) {
            clearInterval(processor.__intervalId);
            processor.__intervalId = null;
          }
        }
      }

      createMediaStreamSource(_stream: unknown) {
        return {
          connect: () => undefined,
          disconnect: () => undefined,
        };
      }

      createGain() {
        return {
          gain: { value: 1 },
          connect: () => undefined,
          disconnect: () => undefined,
        };
      }

      createScriptProcessor() {
        const processor: MockScriptProcessorNode = {
          onaudioprocess: null,
          __intervalId: null,
          connect: () => {
            if (processor.__intervalId !== null) {
              return;
            }
            processor.__intervalId = setInterval(() => {
              if (typeof processor.onaudioprocess !== "function") {
                return;
              }
              const channelData = new Float32Array(4096);
              channelData.fill(0.2);
              processor.onaudioprocess({
                inputBuffer: {
                  getChannelData: () => channelData,
                },
              });
            }, 40);
          },
          disconnect: () => {
            if (processor.__intervalId !== null) {
              clearInterval(processor.__intervalId);
              processor.__intervalId = null;
            }
          },
        };
        this._processors.push(processor);
        return processor;
      }
    }

    Object.defineProperty(window, "AudioContext", {
      value: MockAudioContext,
      configurable: true,
    });
    Object.defineProperty(window, "webkitAudioContext", {
      value: MockAudioContext,
      configurable: true,
    });
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: () =>
          Promise.resolve({
            getTracks: () => [{ stop: () => undefined }],
          }),
      },
      configurable: true,
    });
  });

  await setOverviewTab(page, "ProjectAIChat");
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  const engineCleanup = await ensureManagedChatEngine(page);
  const transcriptionCleanup = await configureProjectChatTranscriptionProfile({
    page,
    dictationMode: "provider",
  });

  allowExpectedApiError(page, {
    path: "/api/appendTranscriptionAudio",
    statuses: [502],
  });
  let appendCallCount = 0;
  let cancelCallCount = 0;
  let stopCallCount = 0;
  await page.route(
    `${BACKEND_ORIGIN}/api/startTranscriptionSession`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          sessionId: "session-provider-append-failure",
          resolvedTransportMode: "realtime",
          chunkMs: 300,
        }),
      });
    },
  );
  await page.route(
    `${BACKEND_ORIGIN}/api/appendTranscriptionAudio`,
    async (route) => {
      appendCallCount += 1;
      await route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({
          detail: "Provider transcription failed.",
        }),
      });
    },
  );
  await page.route(
    `${BACKEND_ORIGIN}/api/cancelTranscriptionSession`,
    async (route) => {
      cancelCallCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    },
  );
  await page.route(
    `${BACKEND_ORIGIN}/api/stopTranscriptionSession`,
    async (route) => {
      stopCallCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          appendText: "",
          fullText: "",
          isFinal: true,
        }),
      });
    },
  );

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

    await expect(overviewPane.getByText("Provider transcription failed.")).toBeVisible();
    await expect(overviewPane.getByText("No speech was detected.")).toHaveCount(0);
    await expect
      .poll(() => appendCallCount, { timeout: 10_000 })
      .toBe(1);
    await expect
      .poll(() => cancelCallCount, { timeout: 10_000 })
      .toBe(1);
    expect(stopCallCount).toBe(0);
  } finally {
    await transcriptionCleanup();
    await engineCleanup();
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project chat keeps browser fallback dictation active until the user stops", async ({
  page,
}) => {
  await page.addInitScript(() => {
    class MockSpeechRecognition {
      continuous = false;
      interimResults = false;
      lang = "en-US";
      onresult: ((event: unknown) => void) | null = null;
      onerror: ((event: { error?: string }) => void) | null = null;
      onend: (() => void) | null = null;

      start() {
        const withState = window as Window & {
          __browserDictationStartCount?: number;
        };
        withState.__browserDictationStartCount =
          (withState.__browserDictationStartCount ?? 0) + 1;
        if (withState.__browserDictationStartCount === 1) {
          setTimeout(() => {
            if (this.onend) {
              this.onend();
            }
          }, 0);
        }
      }

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

    Object.defineProperty(window, "SpeechRecognition", {
      value: MockSpeechRecognition,
      configurable: true,
    });
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
    (
      window as Window & { __readBrowserDictationStartCount?: () => number }
    ).__readBrowserDictationStartCount = () => {
      const withState = window as Window & {
        __browserDictationStartCount?: number;
      };
      return withState.__browserDictationStartCount ?? 0;
    };
  });

  await setOverviewTab(page, "ProjectAIChat");
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  const engineCleanup = await ensureManagedChatEngine(page);
  const transcriptionCleanup = await configureProjectChatTranscriptionProfile({
    page,
    dictationMode: "auto",
  });
  await page.route(
    `${BACKEND_ORIGIN}/api/startTranscriptionSession`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          sessionId: "session-auto-fallback-2",
          resolvedTransportMode: "file",
          chunkMs: 0,
        }),
      });
    },
  );

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

    // Simulate browser recognition ending once and verify we auto-restart.
    await expect
      .poll(async () => {
        return await page.evaluate(() => {
          const reader = (
            window as Window & {
              __readBrowserDictationStartCount?: () => number;
            }
          ).__readBrowserDictationStartCount;
          return typeof reader === "function" ? reader() : 0;
        });
      })
      .toBeGreaterThanOrEqual(2);
    await expect(
      overviewPane.getByRole("button", { name: "Stop Mic" }),
    ).toBeVisible();
    await expect(overviewPane.getByText("Listening...")).toBeVisible();
  } finally {
    await transcriptionCleanup();
    await engineCleanup();
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project chat streams provider file transcription while listening and on stop", async ({
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

    type MockAudioProcessEvent = {
      inputBuffer: { getChannelData: (channel: number) => Float32Array };
    };
    type MockScriptProcessorNode = {
      onaudioprocess: ((event: MockAudioProcessEvent) => void) | null;
      connect: () => void;
      disconnect: () => void;
      __intervalId: ReturnType<typeof setInterval> | null;
    };
    let audioProcessCount = 0;

    class MockAudioContext {
      sampleRate = 24_000;
      destination = {};
      private _processors: MockScriptProcessorNode[] = [];

      async resume() {}

      async close() {
        for (const processor of this._processors) {
          if (processor.__intervalId !== null) {
            clearInterval(processor.__intervalId);
            processor.__intervalId = null;
          }
        }
      }

      createMediaStreamSource(_stream: unknown) {
        return {
          connect: () => undefined,
          disconnect: () => undefined,
        };
      }

      createGain() {
        return {
          gain: { value: 1 },
          connect: () => undefined,
          disconnect: () => undefined,
        };
      }

      createScriptProcessor() {
        const processor: MockScriptProcessorNode = {
          onaudioprocess: null,
          __intervalId: null,
          connect: () => {
            if (processor.__intervalId !== null) {
              return;
            }
            processor.__intervalId = setInterval(() => {
              if (typeof processor.onaudioprocess !== "function") {
                return;
              }
              audioProcessCount += 1;
              const channelData = new Float32Array(4096);
              channelData.fill(0.2);
              processor.onaudioprocess({
                inputBuffer: {
                  getChannelData: () => channelData,
                },
              });
            }, 40);
          },
          disconnect: () => {
            if (processor.__intervalId !== null) {
              clearInterval(processor.__intervalId);
              processor.__intervalId = null;
            }
          },
        };
        this._processors.push(processor);
        return processor;
      }
    }

    Object.defineProperty(window, "AudioContext", {
      value: MockAudioContext,
      configurable: true,
    });
    Object.defineProperty(window, "webkitAudioContext", {
      value: MockAudioContext,
      configurable: true,
    });
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: () =>
          Promise.resolve({
            getTracks: () => [{ stop: () => undefined }],
          }),
      },
      configurable: true,
    });
    (
      window as Window & { __readProviderAudioProcessCount?: () => number }
    ).__readProviderAudioProcessCount = () => audioProcessCount;
  });

  await setOverviewTab(page, "ProjectAIChat");
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  const engineCleanup = await ensureManagedChatEngine(page);
  const transcriptionCleanup = await configureProjectChatTranscriptionProfile({
    page,
    dictationMode: "provider",
  });

  let transcriptionCallCount = 0;
  await page.route(
    `${BACKEND_ORIGIN}/api/startTranscriptionSession`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          sessionId: "session-e2e",
          resolvedTransportMode: "file",
          chunkMs: 300,
        }),
      });
    },
  );
  await page.route(
    `${BACKEND_ORIGIN}/api/appendTranscriptionAudio`,
    async (route) => {
      transcriptionCallCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          appendText: `streamed-${transcriptionCallCount}`,
          fullText: `streamed-${transcriptionCallCount}`,
          isFinal: false,
        }),
      });
    },
  );
  await page.route(
    `${BACKEND_ORIGIN}/api/stopTranscriptionSession`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          appendText: "",
          fullText: `streamed-${transcriptionCallCount}`,
          isFinal: true,
        }),
      });
    },
  );

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

    await expect(
      overviewPane.getByRole("button", { name: "Stop Mic" }),
    ).toBeVisible();
    await expect
      .poll(() => transcriptionCallCount, { timeout: 10_000 })
      .toBeGreaterThan(0);
    await page.waitForTimeout(1200);
    const audioProcessCount = await page.evaluate(() => {
      const withReader = window as Window & {
        __readProviderAudioProcessCount?: () => number;
      };
      return typeof withReader.__readProviderAudioProcessCount === "function"
        ? withReader.__readProviderAudioProcessCount()
        : 0;
    });
    expect(audioProcessCount).toBeGreaterThan(8);
    expect(transcriptionCallCount).toBeLessThan(audioProcessCount);
    expect(transcriptionCallCount * 3).toBeLessThan(audioProcessCount);
    const streamedWhileListeningCount = transcriptionCallCount;

    await overviewPane.getByRole("button", { name: "Stop Mic" }).click();
    await expect
      .poll(() => transcriptionCallCount, { timeout: 10_000 })
      .toBeGreaterThanOrEqual(streamedWhileListeningCount);
    await expect(overviewPane.locator("textarea")).toHaveValue(/streamed-/);
  } finally {
    await transcriptionCleanup();
    await engineCleanup();
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project chat ignores re-entrant provider dictation starts while startup is pending", async ({
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

    class MockAudioContext {
      sampleRate = 24_000;
      destination = {};

      async resume() {}
      async close() {}

      createMediaStreamSource(_stream: unknown) {
        return {
          connect: () => undefined,
          disconnect: () => undefined,
        };
      }

      createGain() {
        return {
          gain: { value: 1 },
          connect: () => undefined,
          disconnect: () => undefined,
        };
      }

      createScriptProcessor() {
        return {
          onaudioprocess: null as ((event: unknown) => void) | null,
          connect: () => undefined,
          disconnect: () => undefined,
        };
      }
    }

    Object.defineProperty(window, "AudioContext", {
      value: MockAudioContext,
      configurable: true,
    });
    Object.defineProperty(window, "webkitAudioContext", {
      value: MockAudioContext,
      configurable: true,
    });
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: () =>
          Promise.resolve({
            getTracks: () => [{ stop: () => undefined }],
          }),
      },
      configurable: true,
    });
  });

  await setOverviewTab(page, "ProjectAIChat");
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  const engineCleanup = await ensureManagedChatEngine(page);
  const transcriptionCleanup = await configureProjectChatTranscriptionProfile({
    page,
    dictationMode: "provider",
  });

  let startCallCount = 0;
  await page.route(
    `${BACKEND_ORIGIN}/api/startTranscriptionSession`,
    async (route) => {
      startCallCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          sessionId: `session-start-guard-${startCallCount}`,
          resolvedTransportMode: "file",
          chunkMs: 0,
        }),
      });
    },
  );
  await page.route(
    `${BACKEND_ORIGIN}/api/stopTranscriptionSession`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          appendText: "",
          fullText: "",
          isFinal: true,
        }),
      });
    },
  );

  try {
    await page.reload();
    await page.waitForSelector(".react-flow__pane");

    const overviewPane = page.locator("#OverviewPane");
    await expect(
      overviewPane.getByRole("heading", { name: "Project AI Chat" }),
    ).toBeVisible();

    const micButton = overviewPane.getByRole("button", { name: "Mic" });
    await expect(micButton).toBeVisible();
    await micButton.evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });

    await expect
      .poll(() => startCallCount, { timeout: 10_000 })
      .toBe(1);
    await expect(
      overviewPane.getByRole("button", { name: "Stop Mic" }),
    ).toBeVisible();
    await overviewPane.getByRole("button", { name: "Stop Mic" }).click();
  } finally {
    await transcriptionCleanup();
    await engineCleanup();
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project chat streams provider realtime transcription while listening", async ({
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

    type MockAudioProcessEvent = {
      inputBuffer: { getChannelData: (channel: number) => Float32Array };
    };
    type MockScriptProcessorNode = {
      onaudioprocess: ((event: MockAudioProcessEvent) => void) | null;
      connect: () => void;
      disconnect: () => void;
      __intervalId: ReturnType<typeof setInterval> | null;
    };

    class MockAudioContext {
      sampleRate = 24_000;
      destination = {};
      private _processors: MockScriptProcessorNode[] = [];

      async resume() {}

      async close() {
        for (const processor of this._processors) {
          if (processor.__intervalId !== null) {
            clearInterval(processor.__intervalId);
            processor.__intervalId = null;
          }
        }
      }

      createMediaStreamSource(_stream: unknown) {
        return {
          connect: () => undefined,
          disconnect: () => undefined,
        };
      }

      createGain() {
        return {
          gain: { value: 1 },
          connect: () => undefined,
          disconnect: () => undefined,
        };
      }

      createScriptProcessor() {
        const processor: MockScriptProcessorNode = {
          onaudioprocess: null,
          __intervalId: null,
          connect: () => {
            if (processor.__intervalId !== null) {
              return;
            }
            processor.__intervalId = setInterval(() => {
              if (typeof processor.onaudioprocess !== "function") {
                return;
              }
              const channelData = new Float32Array(4096);
              channelData.fill(0.2);
              processor.onaudioprocess({
                inputBuffer: {
                  getChannelData: () => channelData,
                },
              });
            }, 40);
          },
          disconnect: () => {
            if (processor.__intervalId !== null) {
              clearInterval(processor.__intervalId);
              processor.__intervalId = null;
            }
          },
        };
        this._processors.push(processor);
        return processor;
      }
    }

    Object.defineProperty(window, "AudioContext", {
      value: MockAudioContext,
      configurable: true,
    });
    Object.defineProperty(window, "webkitAudioContext", {
      value: MockAudioContext,
      configurable: true,
    });
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: () =>
          Promise.resolve({
            getTracks: () => [{ stop: () => undefined }],
          }),
      },
      configurable: true,
    });
  });

  await setOverviewTab(page, "ProjectAIChat");
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  const engineCleanup = await ensureManagedChatEngine(page);
  const transcriptionCleanup = await configureProjectChatTranscriptionProfile({
    page,
    dictationMode: "provider",
  });

  let transcriptionCallCount = 0;
  await page.route(
    `${BACKEND_ORIGIN}/api/startTranscriptionSession`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          sessionId: "session-e2e",
          resolvedTransportMode: "realtime",
          chunkMs: 300,
        }),
      });
    },
  );
  await page.route(
    `${BACKEND_ORIGIN}/api/appendTranscriptionAudio`,
    async (route) => {
      transcriptionCallCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          appendText: `live-${transcriptionCallCount}`,
          fullText: `live-${transcriptionCallCount}`,
          isFinal: false,
        }),
      });
    },
  );
  await page.route(
    `${BACKEND_ORIGIN}/api/stopTranscriptionSession`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          appendText: "",
          fullText: `live-${transcriptionCallCount}`,
          isFinal: true,
        }),
      });
    },
  );

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

    await expect
      .poll(() => transcriptionCallCount, { timeout: 10_000 })
      .toBeGreaterThan(0);
    await expect(overviewPane.locator("textarea")).toHaveValue(/live-/);
    await overviewPane.getByRole("button", { name: "Stop Mic" }).click();
  } finally {
    await transcriptionCleanup();
    await engineCleanup();
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project chat releases provider mic stream when audio context init fails", async ({
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

    let stopCount = 0;
    const audioTrack = {
      stop: () => {
        stopCount += 1;
      },
    };

    class ThrowingAudioContext {
      sampleRate = 24_000;
      destination = {};

      async resume() {
        throw new Error("resume failed");
      }

      async close() {}
    }

    Object.defineProperty(window, "AudioContext", {
      value: ThrowingAudioContext,
      configurable: true,
    });
    Object.defineProperty(window, "webkitAudioContext", {
      value: ThrowingAudioContext,
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
    (
      window as Window & { __providerTrackStopCount?: () => number }
    ).__providerTrackStopCount = () => stopCount;
  });

  await setOverviewTab(page, "ProjectAIChat");
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  const engineCleanup = await ensureManagedChatEngine(page);
  const transcriptionCleanup = await configureProjectChatTranscriptionProfile({
    page,
    dictationMode: "provider",
  });
  await page.route(
    `${BACKEND_ORIGIN}/api/startTranscriptionSession`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          sessionId: "session-provider-capture-fail",
          resolvedTransportMode: "file",
          chunkMs: 0,
        }),
      });
    },
  );

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

    await expect(
      overviewPane.getByText("Provider dictation failed to start: resume failed"),
    ).toBeVisible();
    await expect
      .poll(async () => {
        return await page.evaluate(() => {
          const reader = (
            window as Window & { __providerTrackStopCount?: () => number }
          ).__providerTrackStopCount;
          return typeof reader === "function" ? reader() : 0;
        });
      })
      .toBe(1);
  } finally {
    await transcriptionCleanup();
    await engineCleanup();
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project chat shows controlled feedback when browser dictation start throws", async ({
  page,
}) => {
  await page.addInitScript(() => {
    class ThrowingSpeechRecognition {
      continuous = false;
      interimResults = false;
      lang = "en-US";
      onresult: ((event: unknown) => void) | null = null;
      onerror: ((event: { error?: string }) => void) | null = null;
      onend: (() => void) | null = null;

      start() {
        throw new Error("InvalidStateError");
      }

      stop() {
        if (this.onend) {
          this.onend();
        }
      }
    }

    Object.defineProperty(window, "SpeechRecognition", {
      value: ThrowingSpeechRecognition,
      configurable: true,
    });
    Object.defineProperty(window, "webkitSpeechRecognition", {
      value: ThrowingSpeechRecognition,
      configurable: true,
    });
    Object.defineProperty(window, "MediaRecorder", {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(navigator, "mediaDevices", {
      value: undefined,
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

    await expect(overviewPane.getByText("Dictation failed.")).toBeVisible();
    await expect(
      overviewPane.getByRole("button", { name: "Stop Mic" }),
    ).toHaveCount(0);
  } finally {
    await engineCleanup();
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("chat section streams provider dictation in scriptable mode", async ({
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

    type MockAudioProcessEvent = {
      inputBuffer: { getChannelData: (channel: number) => Float32Array };
    };
    type MockScriptProcessorNode = {
      onaudioprocess: ((event: MockAudioProcessEvent) => void) | null;
      connect: () => void;
      disconnect: () => void;
      __intervalId: ReturnType<typeof setInterval> | null;
    };

    class MockAudioContext {
      sampleRate = 24_000;
      destination = {};
      private _processors: MockScriptProcessorNode[] = [];

      async resume() {}

      async close() {
        for (const processor of this._processors) {
          if (processor.__intervalId !== null) {
            clearInterval(processor.__intervalId);
            processor.__intervalId = null;
          }
        }
      }

      createMediaStreamSource(_stream: unknown) {
        return {
          connect: () => undefined,
          disconnect: () => undefined,
        };
      }

      createGain() {
        return {
          gain: { value: 1 },
          connect: () => undefined,
          disconnect: () => undefined,
        };
      }

      createScriptProcessor() {
        const processor: MockScriptProcessorNode = {
          onaudioprocess: null,
          __intervalId: null,
          connect: () => {
            if (processor.__intervalId !== null) {
              return;
            }
            processor.__intervalId = setInterval(() => {
              if (typeof processor.onaudioprocess !== "function") {
                return;
              }
              const channelData = new Float32Array(4096);
              channelData.fill(0.2);
              processor.onaudioprocess({
                inputBuffer: {
                  getChannelData: () => channelData,
                },
              });
            }, 40);
          },
          disconnect: () => {
            if (processor.__intervalId !== null) {
              clearInterval(processor.__intervalId);
              processor.__intervalId = null;
            }
          },
        };
        this._processors.push(processor);
        return processor;
      }
    }

    Object.defineProperty(window, "AudioContext", {
      value: MockAudioContext,
      configurable: true,
    });
    Object.defineProperty(window, "webkitAudioContext", {
      value: MockAudioContext,
      configurable: true,
    });
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: () =>
          Promise.resolve({
            getTracks: () => [{ stop: () => undefined }],
          }),
      },
      configurable: true,
    });
  });

  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  const engineCleanup = await ensureManagedChatEngine(page);
  let transcriptionProfileId: string | null = null;
  let appendCallCount = 0;
  await page.route(
    `${BACKEND_ORIGIN}/api/startTranscriptionSession`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          sessionId: "session-scriptable-provider-1",
          resolvedTransportMode: "file",
          chunkMs: 0,
        }),
      });
    },
  );
  await page.route(
    `${BACKEND_ORIGIN}/api/appendTranscriptionAudio`,
    async (route) => {
      appendCallCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          appendText: `scriptable-stream-${appendCallCount}`,
          fullText: `scriptable-stream-${appendCallCount}`,
          isFinal: false,
        }),
      });
    },
  );
  await page.route(
    `${BACKEND_ORIGIN}/api/stopTranscriptionSession`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          appendText: "",
          fullText: `scriptable-stream-${appendCallCount}`,
          isFinal: true,
        }),
      });
    },
  );

  try {
    const llmConfigResponse = await page.request.get(
      `${BACKEND_ORIGIN}/api/llm/config`,
    );
    if (!llmConfigResponse.ok()) {
      throw new Error("Failed to load LLM config for scriptable dictation test.");
    }
    const llmConfigPayload = (await llmConfigResponse.json()) as {
      default_config_id?: string | null;
      configs?: Record<string, unknown>;
    };
    const transcriptionConfigId =
      typeof llmConfigPayload.default_config_id === "string" &&
      llmConfigPayload.default_config_id.length > 0
        ? llmConfigPayload.default_config_id
        : Object.keys(llmConfigPayload.configs ?? {})[0] ?? null;
    if (!transcriptionConfigId) {
      throw new Error("Missing transcription config id for scriptable dictation.");
    }
    const createdProfile = await postBackend<{ id: string }>(
      page,
      "/createTranscriptionProfile",
      {
        name: `Scriptable Dictation ${Date.now()}`,
        transcriptionLlmConfigId: transcriptionConfigId,
        transportMode: "file",
        chunkMs: 1200,
        language: null,
      },
    );
    if (!createdProfile?.id) {
      throw new Error("Failed to create transcription profile.");
    }
    transcriptionProfileId = createdProfile.id;

    const { sectionId, sectionName } = await createChatSection(
      page,
      projectContext.projectConfigId,
      "__pw_scriptable_provider_dictation__",
    );
    await postBackend(page, "/setChatSectionSettings", {
      projectConfigId: projectContext.projectConfigId,
      sectionId,
      managed: false,
      engineConfigId: null,
      transcriptionProfileId,
      agentProfileId: null,
      thinking: false,
      permissionMode: "minimal",
      searchEnabled: true,
      dictationMode: "provider",
    });

    await page.reload();
    await page.waitForSelector(".react-flow__pane");

    const section = findSectionByName(page, sectionName);
    await expect(section).toBeVisible();

    const micButton = section.getByRole("button", { name: "Mic" });
    await expect(micButton).toBeVisible();
    await micButton.click();
    await expect
      .poll(() => appendCallCount, { timeout: 10000 })
      .toBeGreaterThanOrEqual(1);
    await expect(section.locator("textarea")).toHaveValue(
      /scriptable-stream-/,
      {
        timeout: 10000,
      },
    );

    const stopButton = section.getByRole("button", { name: "Stop Mic" });
    await expect(stopButton).toBeVisible();
    await stopButton.click();
    await expect(section.getByRole("button", { name: "Mic" })).toBeVisible();
  } finally {
    if (transcriptionProfileId) {
      try {
        await postBackend(page, "/deleteTranscriptionProfile", {
          profileId: transcriptionProfileId,
        });
      } catch {
        // Best-effort cleanup for test-created transcription profiles.
      }
    }
    await engineCleanup();
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("chat section stops browser dictation when composer becomes disabled", async ({
  page,
}) => {
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
        const withCounter = window as Window & {
          __dictationStopCount?: number;
        };
        withCounter.__dictationStopCount =
          (withCounter.__dictationStopCount ?? 0) + 1;
        if (this.onend) {
          this.onend();
        }
      }
    }

    Object.defineProperty(window, "SpeechRecognition", {
      value: MockSpeechRecognition,
      configurable: true,
    });
    Object.defineProperty(window, "webkitSpeechRecognition", {
      value: MockSpeechRecognition,
      configurable: true,
    });
    Object.defineProperty(window, "MediaRecorder", {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(navigator, "mediaDevices", {
      value: undefined,
      configurable: true,
    });
    (
      window as Window & { __readDictationStopCount?: () => number }
    ).__readDictationStopCount = () => {
      const withCounter = window as Window & {
        __dictationStopCount?: number;
      };
      return withCounter.__dictationStopCount ?? 0;
    };
  });

  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  const engineCleanup = await ensureManagedChatEngine(page);
  const backendOrigin =
    process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";

  try {
    const engineConfigsResponse = await page.request.get(
      `${backendOrigin}/api/getEngineConfigs`,
    );
    if (!engineConfigsResponse.ok()) {
      throw new Error("Failed to load engine configs.");
    }
    const engineConfigs = (await engineConfigsResponse.json()) as Array<{
      id: string;
      engineType: string;
    }>;
    const managedEngine = engineConfigs.find(
      (config) => config.engineType === "setta_llm",
    );
    if (!managedEngine) {
      throw new Error("Missing managed chat engine config.");
    }
    const { sectionId, sectionName } = await createChatSection(
      page,
      projectContext.projectConfigId,
      "__pw_chat_dictation_disable__",
    );
    const baseSettings = {
      projectConfigId: projectContext.projectConfigId,
      sectionId,
      managed: true,
      transcriptionProfileId: null,
      agentProfileId: null,
      thinking: false,
      permissionMode: "minimal",
      searchEnabled: true,
      dictationMode: "auto",
    };
    await postBackend(page, "/setChatSectionSettings", {
      ...baseSettings,
      engineConfigId: managedEngine.id,
    });

    await page.reload();
    await page.waitForSelector(".react-flow__pane");

    const section = findSectionByName(page, sectionName);
    await expect(section).toBeVisible();

    const micButton = section.getByRole("button", { name: "Mic" });
    await expect(micButton).toBeVisible();
    await micButton.click();
    await expect(
      section.getByRole("button", { name: "Stop Mic" }),
    ).toBeVisible();
    await expect(section.getByText("Listening...")).toBeVisible();

    await postBackend(page, "/setChatSectionSettings", {
      ...baseSettings,
      engineConfigId: null,
    });

    await expect(section.getByRole("button", { name: "Mic" })).toHaveCount(0);
    await expect(section.getByRole("button", { name: "Stop Mic" })).toHaveCount(
      0,
    );
    await expect(section.getByText("Listening...")).toHaveCount(0);
    await expect
      .poll(async () => {
        return await page.evaluate(() => {
          const withReader = window as Window & {
            __readDictationStopCount?: () => number;
          };
          return typeof withReader.__readDictationStopCount === "function"
            ? withReader.__readDictationStopCount()
            : 0;
        });
      })
      .toBe(1);
  } finally {
    await engineCleanup();
    await cleanupIsolatedProject(page, projectContext);
  }
});

function findSectionByName(page: Page, name: string): Locator {
  return page
    .locator('section[class*="card-section"]')
    .filter({ has: page.locator("header.section-title p", { hasText: name }) })
    .first();
}
