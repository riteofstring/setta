import { useAIStore } from "state/stores/aiStores";
import { res200 } from "utils/endpointUtils";
import {
  route_create_transcription_profile,
  route_delete_transcription_profile,
  route_get_transcription_profiles,
  route_update_transcription_profile,
} from "utils/generatedEndpoints";
import {
  CreateTranscriptionProfileRequestInput,
  DeleteTranscriptionProfileRequestInput,
  TranscriptionProfile,
  UpdateTranscriptionProfileRequestInput,
} from "utils/generatedTypes";

function upsertTranscriptionProfileById(
  items: Array<TranscriptionProfile>,
  entry: TranscriptionProfile,
): Array<TranscriptionProfile> {
  const index = items.findIndex((item) => item.id === entry.id);
  if (index === -1) {
    return [...items, entry];
  }
  const next = [...items];
  next[index] = entry;
  return next;
}

function removeTranscriptionProfileById(
  items: Array<TranscriptionProfile>,
  id: string,
): Array<TranscriptionProfile> {
  return items.filter((item) => item.id !== id);
}

export async function loadTranscriptionProfiles(force: boolean = false) {
  const state = useAIStore.getState();
  if (state.transcriptionProfilesLoading) {
    return;
  }
  if (!force && state.transcriptionProfilesInitialLoadComplete) {
    return;
  }
  useAIStore.setState({ transcriptionProfilesLoading: true });
  const res = await route_get_transcription_profiles();
  if (res200(res)) {
    receiveTranscriptionProfilesUpdate(res.data);
  } else {
    useAIStore.setState({
      transcriptionProfilesInitialLoadComplete: true,
      transcriptionProfilesLoadError: "Failed to load transcription profiles",
      transcriptionProfilesLoading: false,
    });
  }
}

export function receiveTranscriptionProfilesUpdate(
  payload: Array<TranscriptionProfile>,
) {
  useAIStore.setState({
    transcriptionProfiles: payload,
    transcriptionProfilesInitialLoadComplete: true,
    transcriptionProfilesLoadError: null,
    transcriptionProfilesLoading: false,
  });
}

export async function createTranscriptionProfile(
  payload: CreateTranscriptionProfileRequestInput,
): Promise<TranscriptionProfile | null> {
  const res = await route_create_transcription_profile(payload);
  if (!res200(res)) {
    useAIStore.setState({
      transcriptionProfilesLoadError: "Failed to create transcription profile",
    });
    return null;
  }
  const profile = res.data;
  useAIStore.setState((state) => ({
    transcriptionProfiles: upsertTranscriptionProfileById(
      state.transcriptionProfiles,
      profile,
    ),
    transcriptionProfilesInitialLoadComplete: true,
    transcriptionProfilesLoadError: null,
  }));
  return profile;
}

export async function updateTranscriptionProfile(
  payload: UpdateTranscriptionProfileRequestInput,
): Promise<TranscriptionProfile | null> {
  const res = await route_update_transcription_profile(payload);
  if (!res200(res)) {
    useAIStore.setState({
      transcriptionProfilesLoadError: "Failed to update transcription profile",
    });
    return null;
  }
  const profile = res.data;
  useAIStore.setState((state) => ({
    transcriptionProfiles: upsertTranscriptionProfileById(
      state.transcriptionProfiles,
      profile,
    ),
    transcriptionProfilesInitialLoadComplete: true,
    transcriptionProfilesLoadError: null,
  }));
  return profile;
}

export async function deleteTranscriptionProfile(
  payload: DeleteTranscriptionProfileRequestInput,
): Promise<boolean> {
  const res = await route_delete_transcription_profile(payload);
  if (!res200(res)) {
    useAIStore.setState({
      transcriptionProfilesLoadError: "Failed to delete transcription profile",
    });
    return false;
  }
  useAIStore.setState((state) => ({
    transcriptionProfiles: removeTranscriptionProfileById(
      state.transcriptionProfiles,
      payload.profileId,
    ),
    transcriptionProfilesInitialLoadComplete: true,
    transcriptionProfilesLoadError: null,
    projectChatTranscriptionProfileId:
      state.projectChatTranscriptionProfileId === payload.profileId
        ? null
        : state.projectChatTranscriptionProfileId,
  }));
  return true;
}
