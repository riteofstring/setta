import { useAIStore } from "state/stores/aiStores";
import { resetProjectStores } from "state/utils";
import {
  route_create_transcription_profile,
  route_delete_transcription_profile,
  route_get_transcription_profiles,
  route_update_transcription_profile,
} from "utils/generatedEndpoints";
import { TranscriptionTransportModeEnum } from "utils/generatedTypes";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createTranscriptionProfile,
  deleteTranscriptionProfile,
  loadTranscriptionProfiles,
  receiveTranscriptionProfilesUpdate,
  updateTranscriptionProfile,
} from "./aiTranscriptionProfiles";

vi.mock("utils/generatedEndpoints", async () => {
  const actual = await vi.importActual<
    typeof import("utils/generatedEndpoints")
  >("utils/generatedEndpoints");
  return {
    ...actual,
    route_get_transcription_profiles: vi.fn(),
    route_create_transcription_profile: vi.fn(),
    route_update_transcription_profile: vi.fn(),
    route_delete_transcription_profile: vi.fn(),
  };
});

const mockedRouteGetTranscriptionProfiles = vi.mocked(
  route_get_transcription_profiles,
);
const mockedRouteCreateTranscriptionProfile = vi.mocked(
  route_create_transcription_profile,
);
const mockedRouteUpdateTranscriptionProfile = vi.mocked(
  route_update_transcription_profile,
);
const mockedRouteDeleteTranscriptionProfile = vi.mocked(
  route_delete_transcription_profile,
);

describe("aiTranscriptionProfiles", () => {
  afterEach(() => {
    vi.clearAllMocks();
    resetProjectStores();
  });

  it("stores received transcription profiles and clears loading state", () => {
    // Websocket and initial-load updates should replace the store snapshot in one place.
    receiveTranscriptionProfilesUpdate([
      {
        id: "profile-a",
        name: "Realtime",
        transcriptionLlmConfigId: "llm-a",
        transportMode: TranscriptionTransportModeEnum.realtime,
        chunkMs: 250,
        supportsRealtimeTranscription: true,
        language: "en",
      },
    ]);

    expect(useAIStore.getState()).toMatchObject({
      transcriptionProfiles: [
        {
          id: "profile-a",
          name: "Realtime",
          transcriptionLlmConfigId: "llm-a",
          transportMode: TranscriptionTransportModeEnum.realtime,
          chunkMs: 250,
          supportsRealtimeTranscription: true,
          language: "en",
        },
      ],
      transcriptionProfilesInitialLoadComplete: true,
      transcriptionProfilesLoading: false,
      transcriptionProfilesLoadError: null,
    });
  });

  it("loads transcription profiles into the AI store", async () => {
    // The profile loader should avoid custom state shaping beyond the websocket/store path.
    useAIStore.setState({
      transcriptionProfiles: [],
      transcriptionProfilesInitialLoadComplete: false,
      transcriptionProfilesLoading: false,
      transcriptionProfilesLoadError: null,
    });
    mockedRouteGetTranscriptionProfiles.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: [
        {
          id: "profile-a",
          name: "Batch",
          transcriptionLlmConfigId: "llm-a",
          transportMode: TranscriptionTransportModeEnum.file,
          chunkMs: 1200,
          supportsRealtimeTranscription: false,
          language: null,
        },
      ],
    });

    await loadTranscriptionProfiles();

    expect(mockedRouteGetTranscriptionProfiles).toHaveBeenCalledTimes(1);
    expect(useAIStore.getState().transcriptionProfiles).toEqual([
      {
        id: "profile-a",
        name: "Batch",
        transcriptionLlmConfigId: "llm-a",
        transportMode: TranscriptionTransportModeEnum.file,
        chunkMs: 1200,
        supportsRealtimeTranscription: false,
        language: null,
      },
    ]);
  });

  it("creates, updates, and deletes transcription profiles in store state", async () => {
    // CRUD helpers should keep the store snapshot and selected project-chat profile in sync.
    useAIStore.setState({
      transcriptionProfiles: [
        {
          id: "profile-a",
          name: "Old",
          transcriptionLlmConfigId: "llm-a",
          transportMode: TranscriptionTransportModeEnum.file,
          chunkMs: 1200,
          supportsRealtimeTranscription: false,
          language: null,
        },
      ],
      projectChatTranscriptionProfileId: "profile-b",
    });
    mockedRouteCreateTranscriptionProfile.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        id: "profile-b",
        name: "Realtime",
        transcriptionLlmConfigId: "llm-b",
        transportMode: TranscriptionTransportModeEnum.realtime,
        chunkMs: 250,
        supportsRealtimeTranscription: true,
        language: "en",
      },
    });
    mockedRouteUpdateTranscriptionProfile.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        id: "profile-b",
        name: "Realtime Updated",
        transcriptionLlmConfigId: "llm-c",
        transportMode: TranscriptionTransportModeEnum.realtime,
        chunkMs: 300,
        supportsRealtimeTranscription: true,
        language: "fr",
      },
    });
    mockedRouteDeleteTranscriptionProfile.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: { ok: true },
    });

    const created = await createTranscriptionProfile({
      name: "Realtime",
      transcriptionLlmConfigId: "llm-b",
      transportMode: TranscriptionTransportModeEnum.realtime,
      chunkMs: 250,
      language: "en",
    });
    expect(created?.id).toBe("profile-b");
    expect(useAIStore.getState().transcriptionProfiles).toHaveLength(2);

    const updated = await updateTranscriptionProfile({
      profileId: "profile-b",
      name: "Realtime Updated",
      transcriptionLlmConfigId: "llm-c",
      transportMode: TranscriptionTransportModeEnum.realtime,
      chunkMs: 300,
      language: "fr",
    });
    expect(updated?.name).toBe("Realtime Updated");
    expect(
      useAIStore
        .getState()
        .transcriptionProfiles.find((profile) => profile.id === "profile-b")
        ?.transcriptionLlmConfigId,
    ).toBe("llm-c");

    const deleted = await deleteTranscriptionProfile({
      profileId: "profile-b",
    });
    expect(deleted).toBe(true);
    expect(
      useAIStore
        .getState()
        .transcriptionProfiles.find((profile) => profile.id === "profile-b"),
    ).toBeUndefined();
    expect(useAIStore.getState().projectChatTranscriptionProfileId).toBeNull();
  });
});
