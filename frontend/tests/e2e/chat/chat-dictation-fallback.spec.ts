import { expect, test, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  ensureAppReady,
  ensureManagedChatEngine,
  getVisibleProjectChatSurface,
  openIsolatedProject,
  postBackend,
  setOverviewTab,
} from "../helpers";

async function setProjectChatMicrophoneSource(
  page: Page,
  sourceLabel: string,
): Promise<void> {
  const projectChatSurface = await getVisibleProjectChatSurface(page);
  const micSourceInput = page.getByPlaceholder("Microphone source");
  if (!(await micSourceInput.isVisible())) {
    await projectChatSurface
      .getByRole("button", { name: "Project AI Settings" })
      .click();
  }
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

async function setProjectChatEngine(page: Page, engineLabel: string) {
  const projectChatSurface = await getVisibleProjectChatSurface(page);
  const engineInput = page.getByPlaceholder("Select an engine");
  if (!(await engineInput.isVisible())) {
    await projectChatSurface
      .getByRole("button", { name: "Project AI Settings" })
      .click();
  }
  await expect(engineInput).toBeVisible();
  await engineInput.fill(engineLabel);
  await engineInput.press("Enter");
  const escapedEngineLabel = engineLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await expect(engineInput).toHaveValue(new RegExp(escapedEngineLabel));
}

async function setProjectChatTranscriptionProfile(
  page: Page,
  profileLabel: string,
) {
  await page.evaluate(async () => {
    const { loadTranscriptionProfiles } = await import(
      "/src/state/actions/ai.ts"
    );
    await loadTranscriptionProfiles(true);
  });
  const projectChatSurface = await getVisibleProjectChatSurface(page);
  const profileInput = page.getByPlaceholder("Select a transcription profile");
  if (!(await profileInput.isVisible())) {
    await projectChatSurface
      .getByRole("button", { name: "Project AI Settings" })
      .click();
  }
  await expect(profileInput).toBeVisible();
  await profileInput.fill(profileLabel);
  const profileOption = page.locator("dd", { hasText: profileLabel }).first();
  await expect(profileOption).toBeVisible();
  await profileOption.click();
  await expect
    .poll(async () => {
      return await page.evaluate((expectedProfileLabel) => {
        return import("/src/state/definitions.ts").then(({ useAIStore }) => {
          const state = useAIStore.getState();
          const selectedProfileId = state.projectChatTranscriptionProfileId;
          if (!selectedProfileId) {
            return false;
          }
          return (
            (state.transcriptionProfiles.find(
              (profile) => profile.id === selectedProfileId,
            )?.name ?? null) === expectedProfileLabel
          );
        });
      }, profileLabel);
    })
    .toBe(true);
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
    await page.waitForSelector(".setta-gpu-flow__pane");

    const projectChatSurface = await getVisibleProjectChatSurface(page);
    const micButton = projectChatSurface.getByRole("button", { name: "Mic" });
    await expect(micButton).toBeVisible();
    await micButton.click();

    // Auto mode should switch to browser dictation instead of surfacing provider denial.
    await expect(
      projectChatSurface.getByRole("button", { name: "Stop Mic" }),
    ).toBeVisible();
    await expect(projectChatSurface.getByText("Listening...")).toBeVisible();
    await expect(
      projectChatSurface.getByText("Microphone access was denied."),
    ).toHaveCount(0);
  } finally {
    await engineCleanup();
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project chat external engine still uses provider transcription in provider mode", async ({
  page,
}) => {
  // Provide deterministic media primitives so provider dictation can capture and transcribe.
  await page.addInitScript(() => {
    class MockAudioBuffer {
      numberOfChannels = 1;
      length = 2400;
      sampleRate = 24000;

      getChannelData(_channel: number) {
        return new Float32Array(this.length).fill(0.25);
      }
    }

    class MockAudioContext {
      decodeAudioData(_buffer: ArrayBuffer) {
        return Promise.resolve(new MockAudioBuffer());
      }

      close() {
        return Promise.resolve();
      }
    }

    class MockMediaRecorder {
      static isTypeSupported(_mimeType: string) {
        return true;
      }

      mimeType = "audio/webm";
      state: "inactive" | "recording" = "inactive";
      ondataavailable: ((event: { data?: Blob }) => void) | null = null;
      onerror: (() => void) | null = null;
      onstop: (() => void) | null = null;

      constructor(_stream: MediaStream, _options?: { mimeType?: string }) {}

      start() {
        this.state = "recording";
      }

      stop() {
        this.state = "inactive";
        if (this.ondataavailable) {
          this.ondataavailable({
            data: new Blob([new Uint8Array([1, 2, 3, 4])], {
              type: "audio/webm",
            }),
          });
        }
        if (this.onstop) {
          this.onstop();
        }
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
    Object.defineProperty(window, "MediaRecorder", {
      value: MockMediaRecorder,
      configurable: true,
    });
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: () =>
          Promise.resolve({
            getTracks: () => [{ stop: () => {} }],
          }),
      },
      configurable: true,
    });
  });

  let startSessionPayloads: Array<Record<string, unknown>> = [];
  let appendCount = 0;
  let stopCount = 0;
  await page.route("**/api/getEngineConfigs", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "engine-setta",
          name: "Setta LLM",
          engineType: "setta_llm",
          settaLlmConfigId: "openai-whisper-1",
          externalAgentConfigId: null,
          defaults: { thinking: true },
        },
        {
          id: "engine-codex",
          name: "Codex (app-server)",
          engineType: "external_agent",
          settaLlmConfigId: null,
          externalAgentConfigId: "external-codex",
          defaults: { thinking: null },
        },
      ]),
    });
  });
  await page.route("**/api/getExternalAgentHealth", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          configId: "external-codex",
          name: "Codex (app-server)",
          toolType: "codex",
          runMode: "app_server",
          supported: true,
          available: true,
          issues: [],
          nodePath: null,
          nodeVersion: null,
          sdkVersion: null,
          cliVersion: "0.0.0",
          baseUrl: null,
          workingDir: null,
          envVars: { present: [], missing: [] },
        },
      ]),
    });
  });
  await page.route("**/api/getTranscriptionProfiles", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "transcription-openai-whisper-1",
          name: "OpenAI Whisper 1",
          transcriptionLlmConfigId: "openai-whisper-1",
          transportMode: "file",
          chunkMs: 1200,
          supportsRealtimeTranscription: false,
          language: null,
        },
      ]),
    });
  });
  await page.route("**/api/llm/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configs: {
          "openai-whisper-1": {
            id: "openai-whisper-1",
            model: "gpt-4o-mini-transcribe",
            provider: "openai",
            api_key_env: "OPENAI_API_KEY",
            base_url: null,
            other_params: null,
            mcpServerIds: [],
            temporary: false,
          },
        },
        mcpServers: {},
        defaultMcpServerIds: [],
        default_config_id: "openai-whisper-1",
        codexMcpImportedAt: null,
      }),
    });
  });
  await page.route("**/api/llm/apiKeys", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        apiKeys: { OPENAI_API_KEY: "test-openai-key" },
        revision: 1,
      }),
    });
  });
  await page.route("**/api/startTranscriptionSession", async (route) => {
    const payload = route.request().postDataJSON() as Record<string, unknown>;
    startSessionPayloads.push(payload);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sessionId: "session-external-engine",
        resolvedTransportMode: "file",
        chunkMs: 1200,
      }),
    });
  });
  await page.route("**/api/appendTranscriptionAudio", async (route) => {
    appendCount += 1;
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
  await page.route("**/api/stopTranscriptionSession", async (route) => {
    stopCount += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        appendText: "",
        fullText: "external provider transcript",
        isFinal: true,
      }),
    });
  });
  await page.route("**/api/cancelTranscriptionSession", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });

  await setOverviewTab(page, "ProjectAIChat");
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    await page.reload();
    await page.waitForSelector(".setta-gpu-flow__pane");
    const projectChatSurface = await getVisibleProjectChatSurface(page);

    await setProjectChatEngine(page, "Codex");
    await setProjectChatTranscriptionProfile(page, "OpenAI Whisper 1");
    await setProjectChatMicrophoneSource(page, "Always provider");

    const micButton = projectChatSurface.getByRole("button", { name: "Mic" });
    await expect(micButton).toBeVisible();
    await micButton.click();
    await expect(
      projectChatSurface.getByRole("button", { name: "Stop Mic" }),
    ).toBeVisible();
    await projectChatSurface.getByRole("button", { name: "Stop Mic" }).click();

    await expect.poll(() => startSessionPayloads.length).toBe(1);
    await expect.poll(() => appendCount).toBeGreaterThan(0);
    await expect.poll(() => stopCount).toBe(1);
    expect(startSessionPayloads[0]?.transcriptionProfileId).toBe(
      "transcription-openai-whisper-1",
    );
    await expect(projectChatSurface.locator("textarea").first()).toHaveValue(
      /external provider transcript/,
    );
    await expect(
      projectChatSurface.getByText("Provider dictation is not available."),
    ).toHaveCount(0);
  } finally {
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
    await page.waitForSelector(".setta-gpu-flow__pane");

    const projectChatSurface = await getVisibleProjectChatSurface(page);
    const micButton = projectChatSurface.getByRole("button", { name: "Mic" });
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
      projectChatSurface.getByRole("button", { name: "Stop Mic" }),
    ).toBeVisible();
    await expect(projectChatSurface.getByText("Listening...")).toBeVisible();
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
    await page.waitForSelector(".setta-gpu-flow__pane");

    await setProjectChatMicrophoneSource(page, "Always browser / OS");

    const projectChatSurface = await getVisibleProjectChatSurface(page);
    const micButton = projectChatSurface.getByRole("button", { name: "Mic" });
    await expect(micButton).toBeVisible();
    await micButton.click();

    await expect(
      projectChatSurface.getByRole("button", { name: "Stop Mic" }),
    ).toBeVisible();
    await expect(projectChatSurface.getByText("Listening...")).toBeVisible();
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
    await page.waitForSelector(".setta-gpu-flow__pane");

    const backendOrigin =
      process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
    const llmConfigResponse = await page.request.get(
      `${backendOrigin}/api/llm/config`,
    );
    if (!llmConfigResponse.ok()) {
      throw new Error("Failed to load llm config payload.");
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
    const transcriptionConfigEntry =
      llmConfigEntries.find(([, config]) => {
        return (
          config.provider === "openai" &&
          config.api_key_env === "OPENAI_API_KEY"
        );
      }) ??
      llmConfigEntries.find(([, config]) => config.provider === "openai") ??
      llmConfigEntries[0];
    if (!transcriptionConfigEntry) {
      throw new Error("Missing transcription-compatible LLM config.");
    }
    const transcriptionLlmConfigId = transcriptionConfigEntry[0];
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
    const transcriptionProfileName = `E2E Mic Start Failure ${Date.now()}`;
    const transcriptionProfile = await postBackend<{ id?: string }>(
      page,
      "/createTranscriptionProfile",
      {
        name: transcriptionProfileName,
        transcriptionLlmConfigId,
        transportMode: "file",
        chunkMs: 1200,
        language: null,
      },
    );
    if (!transcriptionProfile?.id) {
      throw new Error("Missing transcription profile id.");
    }

    const engineConfigsResponse = await page.request.get(
      `${backendOrigin}/api/getEngineConfigs`,
    );
    if (!engineConfigsResponse.ok()) {
      throw new Error("Failed to load engine configs.");
    }
    const managedEngineName =
      (
        (await engineConfigsResponse.json()) as Array<{
          name?: string;
          engineType?: string;
        }>
      ).find((config) => config.engineType === "setta_llm")?.name ?? null;
    if (!managedEngineName) {
      throw new Error("Missing managed engine name.");
    }

    await setProjectChatEngine(page, managedEngineName);
    await setProjectChatTranscriptionProfile(page, transcriptionProfileName);
    await setProjectChatMicrophoneSource(page, "Always provider");

    const projectChatSurface = await getVisibleProjectChatSurface(page);
    const micButton = projectChatSurface.getByRole("button", { name: "Mic" });
    await expect(micButton).toBeVisible();
    await micButton.click();

    await expect(
      projectChatSurface.getByText("Microphone access was denied."),
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
    await page.waitForSelector(".setta-gpu-flow__pane");

    const projectChatSurface = await getVisibleProjectChatSurface(page);
    const micButton = projectChatSurface.getByRole("button", { name: "Mic" });
    await expect(micButton).toBeVisible();
    await micButton.click();

    await expect(
      projectChatSurface.getByText("Dictation failed."),
    ).toBeVisible();
    await expect(
      projectChatSurface.getByRole("button", { name: "Stop Mic" }),
    ).toHaveCount(0);
  } finally {
    await engineCleanup();
    await cleanupIsolatedProject(page, projectContext);
  }
});
