import type {
  CartographerProcessingState,
  CartographerRun,
  ChatModelOption,
  SemanticCartographerSettingsInput,
  SemanticCartographerSettingsMetadata,
  SemanticCartographerSettingsRecord,
  WorkspaceSession,
} from "@generated/backend";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  inputFromRecord,
  useSemanticCartographerSettingsStore,
} from "./semantic-cartographer-settings-store";
import { useWorkspaceStore } from "./workspace-store";

describe("semantic cartographer settings store", () => {
  beforeEach(() => {
    resetCartographerStore();
    useWorkspaceStore.setState({
      error: null,
      operation: null,
      session: workspaceSession("workspace_one"),
      status: "ready",
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("loads settings metadata, processing state, and model options for the selected workspace", async () => {
    const metadata = testMetadata();
    const processingState = testProcessingState({ settingsHash: metadata.record.settingsHash });
    const modelOptions = testModelOptions();
    const api = installCartographerAPI({ metadata, modelOptions, processingState });

    await useSemanticCartographerSettingsStore.getState().refresh();

    const state = useSemanticCartographerSettingsStore.getState();
    expect(api.readCartographerSettingsMetadata).toHaveBeenCalledWith({});
    expect(api.readCartographerProcessingState).toHaveBeenCalledWith({});
    expect(api.listCartographerModelOptions).toHaveBeenCalledWith({ workspaceId: "workspace_one" });
    expect(api.listCartographerRuns).toHaveBeenCalledWith({
      chatRunId: "",
      limit: 5,
      targetEntityId: "",
      workflowExecutionId: "",
      workspaceId: "workspace_one",
    });
    expect(state.status).toBe("ready");
    expect(state.record).toBe(metadata.record);
    expect(state.draft).toEqual(inputFromRecord(metadata.record));
    expect(state.modelOptions).toEqual(modelOptions);
    expect(state.modelOptionsWorkspaceId).toBe("workspace_one");
    expect(state.processingState).toBe(processingState);
    expect(state.recentRuns).toEqual([]);
    expect(state.dirty).toBe(false);
  });

  test("skips model catalog loading and keeps save unavailable when no workspace is selected", async () => {
    useWorkspaceStore.setState({ session: workspaceSession("") });
    const api = installCartographerAPI({ metadata: testMetadata(), modelOptions: [] });

    await useSemanticCartographerSettingsStore.getState().refresh();
    await useSemanticCartographerSettingsStore.getState().saveDraft();

    const state = useSemanticCartographerSettingsStore.getState();
    expect(api.listCartographerModelOptions).not.toHaveBeenCalled();
    expect(api.listCartographerRuns).not.toHaveBeenCalled();
    expect(api.updateCartographerSettings).not.toHaveBeenCalled();
    expect(state.selectedWorkspaceId).toBeNull();
    expect(state.error).toBe("Select a workspace to validate and save cartographer settings.");
  });

  test("saves, reverts, and resets the draft", async () => {
    const metadata = testMetadata({
      settings: {
        ...testSettingsInput(),
        automaticProcessingEnabled: true,
        processingConfig: {
          ...testSettingsInput().processingConfig,
          maxConcurrent: 2,
        },
      },
      settingsHash: "sha256:initial",
    });
    const api = installCartographerAPI({ metadata, modelOptions: testModelOptions() });
    await useSemanticCartographerSettingsStore.getState().refresh();

    useSemanticCartographerSettingsStore.getState().setAutomaticProcessingEnabled(false);
    expect(useSemanticCartographerSettingsStore.getState().dirty).toBe(true);

    const savedSettings = useSemanticCartographerSettingsStore.getState().draft;
    if (!savedSettings) {
      throw new Error("missing cartographer settings draft");
    }
    const savedRecord = testRecord({
      settings: savedSettings,
      settingsHash: "sha256:saved",
    });
    api.updateCartographerSettings.mockResolvedValueOnce(savedRecord);

    await useSemanticCartographerSettingsStore.getState().saveDraft();

    expect(api.updateCartographerSettings).toHaveBeenCalledWith({
      settings: savedSettings,
      workspaceId: "workspace_one",
    });
    expect(useSemanticCartographerSettingsStore.getState().record).toBe(savedRecord);
    expect(useSemanticCartographerSettingsStore.getState().dirty).toBe(false);

    useSemanticCartographerSettingsStore
      .getState()
      .setNumberField("processingConfig.maxConcurrent", 4);
    expect(
      useSemanticCartographerSettingsStore.getState().draft?.processingConfig.maxConcurrent,
    ).toBe(4);
    useSemanticCartographerSettingsStore.getState().revertDraft();
    expect(
      useSemanticCartographerSettingsStore.getState().draft?.processingConfig.maxConcurrent,
    ).toBe(2);
    expect(useSemanticCartographerSettingsStore.getState().dirty).toBe(false);

    useSemanticCartographerSettingsStore.getState().resetDraftToDefaults();
    expect(useSemanticCartographerSettingsStore.getState().draft).toEqual(metadata.defaultSettings);
    expect(useSemanticCartographerSettingsStore.getState().dirty).toBe(true);
  });

  test("keeps backend validation failures visible without clearing the dirty draft", async () => {
    const api = installCartographerAPI({
      metadata: testMetadata(),
      modelOptions: testModelOptions(),
    });
    await useSemanticCartographerSettingsStore.getState().refresh();
    useSemanticCartographerSettingsStore.getState().setAutomaticProcessingEnabled(false);
    api.updateCartographerSettings.mockRejectedValueOnce(
      new Error('semantic cartographer live task config explicit model "missing" is absent'),
    );

    await useSemanticCartographerSettingsStore.getState().saveDraft();

    const state = useSemanticCartographerSettingsStore.getState();
    expect(state.status).toBe("error");
    expect(state.error).toContain('explicit model "missing" is absent');
    expect(state.dirty).toBe(true);
  });

  test("reports local validation errors for unsupported saved catalog choices", async () => {
    const settings = testSettingsInput();
    settings.liveTaskConfig = {
      inputBudget: 6000,
      modelId: "missing-model",
      modelSelection: "explicit",
      reasoningEffort: "high",
    };
    const api = installCartographerAPI({
      metadata: testMetadata({ settings }),
      modelOptions: testModelOptions(),
    });

    await useSemanticCartographerSettingsStore.getState().refresh();
    await useSemanticCartographerSettingsStore.getState().saveDraft();

    const state = useSemanticCartographerSettingsStore.getState();
    expect(state.fieldErrors["liveTaskConfig.modelId"]).toBe(
      "Model is not in the current Codex catalog.",
    );
    expect(state.error).toBe("Resolve cartographer settings validation errors before saving.");
    expect(api.updateCartographerSettings).not.toHaveBeenCalled();
  });

  test("ignores stale model options from an old selected workspace", async () => {
    const oldModels = deferred<ChatModelOption[]>();
    const newModels = deferred<ChatModelOption[]>();
    const api = installCartographerAPI({
      metadata: testMetadata(),
      modelOptions: [],
      listModelOptions: ({ workspaceId }) =>
        workspaceId === "workspace_old" ? oldModels.promise : newModels.promise,
    });

    useWorkspaceStore.setState({ session: workspaceSession("workspace_old") });
    const firstRefresh = useSemanticCartographerSettingsStore.getState().refresh();
    useWorkspaceStore.setState({ session: workspaceSession("workspace_new") });
    const secondRefresh = useSemanticCartographerSettingsStore.getState().refresh();
    const newModelOptions = [testModelOption({ model: "new-model" })];
    newModels.resolve(newModelOptions);
    await secondRefresh;
    oldModels.resolve([testModelOption({ model: "old-model" })]);
    await firstRefresh;

    expect(api.listCartographerModelOptions).toHaveBeenCalledWith({ workspaceId: "workspace_old" });
    expect(api.listCartographerModelOptions).toHaveBeenCalledWith({ workspaceId: "workspace_new" });
    expect(useSemanticCartographerSettingsStore.getState().modelOptions).toEqual(newModelOptions);
    expect(useSemanticCartographerSettingsStore.getState().modelOptionsWorkspaceId).toBe(
      "workspace_new",
    );
  });
});

function resetCartographerStore() {
  useSemanticCartographerSettingsStore.setState({
    dirty: false,
    draft: null,
    error: null,
    fieldErrors: {},
    metadata: null,
    modelOptions: [],
    modelOptionsWorkspaceId: null,
    processingState: null,
    recentRuns: [],
    record: null,
    selectedWorkspaceId: null,
    status: "idle",
  });
}

function installCartographerAPI({
  listModelOptions,
  metadata,
  modelOptions,
  processingState = testProcessingState({ settingsHash: metadata.record.settingsHash }),
  recentRuns = [],
}: {
  listModelOptions?: (request: { workspaceId: string }) => Promise<ChatModelOption[]>;
  metadata: SemanticCartographerSettingsMetadata;
  modelOptions: ChatModelOption[];
  processingState?: CartographerProcessingState;
  recentRuns?: CartographerRun[];
}) {
  const api = {
    listCartographerModelOptions: vi.fn(listModelOptions ?? (async () => modelOptions)),
    listCartographerRuns: vi.fn(async () => ({
      limit: 5,
      runs: recentRuns,
      workspaceId: "workspace_one",
    })),
    readCartographerProcessingState: vi.fn(async () => processingState),
    readCartographerSettingsMetadata: vi.fn(async () => metadata),
    updateCartographerSettings: vi.fn(async ({ settings }) =>
      testRecord({ settings, settingsHash: "sha256:updated" }),
    ),
  };
  vi.stubGlobal("window", {
    setta: {
      semanticGraph: api,
    },
  });
  return api;
}

function testMetadata({
  settings = testSettingsInput(),
  settingsHash = "sha256:settings",
}: {
  settings?: SemanticCartographerSettingsInput;
  settingsHash?: string;
} = {}): SemanticCartographerSettingsMetadata {
  return {
    defaultSettings: testSettingsInput(),
    numberBounds: [
      { field: "liveTaskConfig.inputBudget", min: 1 },
      { field: "finalSynthesisTaskConfig.inputBudget", min: 1 },
      { field: "processingConfig.maxConcurrent", min: 1 },
      { field: "processingConfig.perSourceConcurrent", min: 1 },
      { field: "processingConfig.maxQueuedPerSource", min: 1 },
      { field: "processingConfig.leaseDurationSeconds", min: 1 },
      { field: "observationConfig.maxWindowContentBytes", min: 1 },
      { field: "observationConfig.assistantThresholdBytes", min: 1 },
      { field: "observationConfig.outputThresholdBytes", min: 1 },
    ],
    record: testRecord({ settings, settingsHash }),
    relationships: [
      {
        comparedField: "processingConfig.maxConcurrent",
        field: "processingConfig.perSourceConcurrent",
        operator: "lte",
      },
      {
        comparedField: "observationConfig.maxWindowContentBytes",
        field: "observationConfig.assistantThresholdBytes",
        operator: "lte",
      },
    ],
  };
}

function testRecord({
  settings = testSettingsInput(),
  settingsHash = "sha256:settings",
}: {
  settings?: SemanticCartographerSettingsInput;
  settingsHash?: string;
} = {}): SemanticCartographerSettingsRecord {
  return {
    createdAt: "2026-06-15T12:00:00Z",
    id: "global",
    settings: {
      ...settings,
      schemaVersion: 1,
      updatedAt: "2026-06-15T12:00:00Z",
    },
    settingsHash,
    updatedAt: "2026-06-15T12:00:00Z",
  };
}

function testSettingsInput(): SemanticCartographerSettingsInput {
  return {
    auditConfig: { captureLevel: "standard" },
    automaticProcessingEnabled: true,
    finalSynthesisTaskConfig: {
      inputBudget: 12000,
      modelId: "",
      modelSelection: "provider_default",
      reasoningEffort: "medium",
    },
    liveTaskConfig: {
      inputBudget: 6000,
      modelId: "",
      modelSelection: "provider_default",
      reasoningEffort: "low",
    },
    observationConfig: {
      assistantThresholdBytes: 4096,
      maxWindowContentBytes: 8192,
      maxWindowEvents: 24,
      outputThresholdBytes: 4096,
      priorSummaryLimit: 8,
      quietCloseAfterSeconds: 120,
      tokenBudget: 6000,
    },
    processingConfig: {
      leaseDurationSeconds: 600,
      maxConcurrent: 2,
      maxQueuedPerSource: 8,
      perSourceConcurrent: 1,
    },
  };
}

function testModelOptions(): ChatModelOption[] {
  return [
    testModelOption({ isDefault: true, model: "gpt-default" }),
    testModelOption({ isDefault: false, model: "gpt-fast" }),
  ];
}

function testModelOption({
  isDefault = true,
  model,
}: {
  isDefault?: boolean;
  model: string;
}): ChatModelOption {
  return {
    defaultReasoningEffort: "medium",
    description: `${model} description`,
    displayName: model,
    hidden: false,
    id: model,
    isDefault,
    model,
    supportedReasoningEfforts: [
      {
        description: "Low reasoning",
        displayName: "Low",
        effort: "low",
        isDefault: false,
      },
      {
        description: "Medium reasoning",
        displayName: "Medium",
        effort: "medium",
        isDefault: true,
      },
      {
        description: "High reasoning",
        displayName: "High",
        effort: "high",
        isDefault: false,
      },
    ],
  };
}

function testProcessingState({
  settingsHash,
}: {
  settingsHash: string;
}): CartographerProcessingState {
  return {
    completedNoopRunCount: 0,
    concurrencyGuidance: "Cartographer concurrency is within the configured limits.",
    createdSemanticEventIds: [],
    durableQueuedWindowCount: 0,
    durableRunningWindowCount: 0,
    effectiveProcessingConfig: {
      leaseDurationSeconds: 600,
      maxConcurrent: 2,
      maxQueuedPerSource: 8,
      perSourceConcurrent: 1,
    },
    enabled: true,
    failedRunCount: 0,
    lastAppliedAt: "",
    lastAppliedPatchId: "",
    lastFailure: null,
    lastFailureRunSummary: null,
    lastNoopAt: "",
    lastNoopReason: "",
    lastNoopRunId: "",
    lastProcessedAt: "",
    lastProcessedRunId: "",
    lastProcessedRunSummary: null,
    lastProcessedWindowId: "",
    lastProcessedWorkspaceId: "",
    lastSupersededAt: "",
    lastSupersededWindowId: "",
    maxConcurrent: 2,
    pendingReviewPatchCount: 0,
    perSourceConcurrent: 1,
    queuedWindowCount: 0,
    queuedWindows: [],
    runningWindowCount: 0,
    runningWindows: [],
    settingsHash,
    staleLeaseCount: 0,
    started: true,
    supersededWindowCount: 0,
  };
}

function workspaceSession(selectedWorkspaceId: string): WorkspaceSession {
  return {
    activeWorkspaces: [],
    recentWorkspaces: [],
    selectedWorkspaceId,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}
