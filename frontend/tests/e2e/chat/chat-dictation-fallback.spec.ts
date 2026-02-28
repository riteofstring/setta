import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createChatSection,
  ensureAppReady,
  ensureManagedChatEngine,
  openIsolatedProject,
  postBackend,
  setOverviewTab,
} from "../helpers";

async function setProjectChatMicrophoneSource(
  page: Page,
  sourceLabel: string,
): Promise<void> {
  const overviewPane = page.locator("#OverviewPane");
  await overviewPane
    .getByRole("button", { name: "Project AI Settings" })
    .click();
  const micSourceInput = page.getByPlaceholder("Microphone source");
  await expect(micSourceInput).toBeVisible();
  await micSourceInput.fill(sourceLabel);
  await micSourceInput.press("Enter");
  const selectedSource = await micSourceInput.inputValue();
  if (
    sourceLabel === "Always provider" &&
    selectedSource.includes("requires LLM engine")
  ) {
    const engineInput = page.getByPlaceholder("Select an engine");
    await expect(engineInput).toBeVisible();
    await engineInput.fill("setta");
    await engineInput.press("Enter");
    await micSourceInput.fill(sourceLabel);
    await micSourceInput.press("Enter");
  }
  const escapedSourceLabel = sourceLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await expect(micSourceInput).toHaveValue(
    new RegExp(`^${escapedSourceLabel}`),
  );
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

test("chat section falls back to browser dictation when provider transcription stop returns no delta", async ({
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
        if (this.ondataavailable) {
          this.ondataavailable({
            data: new Blob([new Uint8Array([1, 2, 3])], {
              type: "audio/webm",
            }),
          });
        }
        if (this.onstop) {
          this.onstop();
        }
      }
    }

    const track = {
      stop: () => {},
    };
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
        getUserMedia: () =>
          Promise.resolve({
            getTracks: () => [track],
          }),
      },
      configurable: true,
    });
  });

  await page.route("**/startTranscriptionSession", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sessionId: "session-1",
        resolvedTransportMode: "file",
        chunkMs: 1200,
      }),
    });
  });
  await page.route("**/appendTranscriptionAudio", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        appendText: "",
        fullText: "",
        isFinal: false,
      }),
    });
  });
  await page.route("**/stopTranscriptionSession", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "null",
    });
  });
  await page.route("**/cancelTranscriptionSession", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });

  await setOverviewTab(page, "ProjectAIChat");
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

    const llmConfigResponse = await page.request.get(
      `${backendOrigin}/api/llm/config`,
    );
    if (!llmConfigResponse.ok()) {
      throw new Error("Failed to load llm config.");
    }
    const llmConfigPayload = (await llmConfigResponse.json()) as {
      configs?: Record<
        string,
        {
          provider?: string;
          api_key_env?: string | null;
        }
      >;
    };
    const llmConfigEntries = Object.entries(llmConfigPayload.configs ?? {});
    const preferredTranscriptionConfigEntry =
      llmConfigEntries.find(([, config]) => {
        return (
          config.provider === "openai" &&
          config.api_key_env === "OPENAI_API_KEY"
        );
      }) ??
      llmConfigEntries.find(([, config]) => config.provider === "openai") ??
      llmConfigEntries[0];
    if (!preferredTranscriptionConfigEntry) {
      throw new Error("Missing transcription-compatible LLM config.");
    }
    const transcriptionLlmConfigId = preferredTranscriptionConfigEntry[0];

    const apiKeysResponse = await page.request.get(
      `${backendOrigin}/api/llm/apiKeys`,
    );
    if (!apiKeysResponse.ok()) {
      throw new Error("Failed to load llm api keys.");
    }
    const apiKeysPayload = (await apiKeysResponse.json()) as {
      revision: number;
    };
    await postBackend(page, "/llm/apiKeys", {
      apiKeys: {
        OPENAI_API_KEY: "sk-e2e",
      },
      expectedRevision: apiKeysPayload.revision,
    });

    const transcriptionProfile = await postBackend<{ id?: string }>(
      page,
      "/createTranscriptionProfile",
      {
        name: "E2E Transcription Profile",
        transcriptionLlmConfigId,
        transportMode: "file",
        chunkMs: 1200,
        language: null,
      },
    );
    if (!transcriptionProfile?.id) {
      throw new Error("Missing transcription profile id.");
    }

    const { sectionId, sectionName } = await createChatSection(
      page,
      projectContext.projectConfigId,
      "__pw_provider_stop_null__",
    );
    await postBackend(page, "/setChatSectionSettings", {
      projectConfigId: projectContext.projectConfigId,
      sectionId,
      managed: true,
      agentProfileId: null,
      thinking: false,
      permissionMode: "minimal",
      searchEnabled: true,
      engineConfigId: managedEngine.id,
      transcriptionProfileId: transcriptionProfile.id,
      listenerConfigId: null,
      dictationMode: "auto",
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

    await section.getByRole("button", { name: "Stop Mic" }).click();

    await expect(section.getByText("Listening...")).toBeVisible();
    await expect(
      section.getByText("Provider transcription stop returned no result."),
    ).toHaveCount(0);
  } finally {
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
    await engineCleanup();
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project chat browser-only dictation mode skips provider capture", async ({
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

    let getUserMediaCount = 0;
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
        getUserMedia: () => {
          getUserMediaCount += 1;
          return Promise.reject(new Error("provider should not be used"));
        },
      },
      configurable: true,
    });
    (
      window as Window & { __readProviderGetUserMediaCount?: () => number }
    ).__readProviderGetUserMediaCount = () => getUserMediaCount;
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

    await setProjectChatMicrophoneSource(page, "Always browser / OS");

    const micButton = overviewPane.getByRole("button", { name: "Mic" });
    await expect(micButton).toBeVisible();
    await micButton.click();

    await expect(
      overviewPane.getByRole("button", { name: "Stop Mic" }),
    ).toBeVisible();
    await expect(overviewPane.getByText("Listening...")).toBeVisible();
    await expect
      .poll(async () => {
        return await page.evaluate(() => {
          const reader = (
            window as Window & {
              __readProviderGetUserMediaCount?: () => number;
            }
          ).__readProviderGetUserMediaCount;
          return typeof reader === "function" ? reader() : -1;
        });
      })
      .toBe(0);
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
    (
      window as Window & { __providerTrackStopCount?: () => number }
    ).__providerTrackStopCount = () => stopCount;
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

    await setProjectChatMicrophoneSource(page, "Always provider");

    const micButton = overviewPane.getByRole("button", { name: "Mic" });
    await expect(micButton).toBeVisible();
    await micButton.click();

    await expect(
      overviewPane.getByText("Microphone access was denied."),
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
      agentProfileId: null,
      thinking: false,
      permissionMode: "minimal",
      searchEnabled: true,
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
