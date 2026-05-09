import { expect, test } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createChatSection,
  ensureAppReady,
  ensureManagedChatEngine,
  openIsolatedProject,
  postBackend,
  setOverviewTab,
} from "../helpers";
import { findSectionByName } from "./chat-tool-calls-helpers";

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
