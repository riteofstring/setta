import { useAIStore } from "state/stores/aiStores";
import { res200 } from "utils/endpointUtils";
import {
  route_get_agent_profiles,
  route_get_engine_configs,
  route_get_external_agent_configs,
  route_get_external_agent_health,
  route_get_prompt_templates,
} from "utils/generatedEndpoints";
import { type ExternalAgentConfig } from "utils/generatedTypes";
import {
  receiveExternalAgentConfigsUpdate as applyExternalAgentConfigsUpdate,
  receiveAgentProfilesLoadFailure,
  receiveAgentProfilesUpdate,
  receiveEngineConfigsLoadFailure,
  receiveEngineConfigsUpdate,
  receiveExternalAgentConfigsLoadFailure,
  receiveExternalAgentHealthLoadFailure,
  receiveExternalAgentHealthUpdate,
  receivePromptTemplatesLoadFailure,
  receivePromptTemplatesUpdate,
} from "./aiConfigurationCatalogState";

export async function loadAgentProfiles(force: boolean = false) {
  const state = useAIStore.getState();
  if (state.agentProfilesLoading) {
    return;
  }
  if (!force && state.agentProfilesInitialLoadComplete) {
    return;
  }
  useAIStore.setState({ agentProfilesLoading: true });
  const res = await route_get_agent_profiles();
  if (res200(res)) {
    receiveAgentProfilesUpdate(res.data);
    return;
  }
  receiveAgentProfilesLoadFailure("Failed to load agent profiles");
}

export async function loadPromptTemplates(force: boolean = false) {
  const state = useAIStore.getState();
  if (state.promptTemplatesLoading) {
    return;
  }
  if (!force && state.promptTemplatesInitialLoadComplete) {
    return;
  }
  useAIStore.setState({ promptTemplatesLoading: true });
  const res = await route_get_prompt_templates();
  if (res200(res)) {
    receivePromptTemplatesUpdate(res.data);
    return;
  }
  receivePromptTemplatesLoadFailure("Failed to load prompt templates");
}

export async function loadExternalAgentConfigs(force: boolean = false) {
  const state = useAIStore.getState();
  if (state.externalAgentConfigsLoading) {
    return;
  }
  if (!force && state.externalAgentConfigsInitialLoadComplete) {
    return;
  }
  useAIStore.setState({ externalAgentConfigsLoading: true });
  const res = await route_get_external_agent_configs();
  if (res200(res)) {
    receiveExternalAgentConfigsUpdate(res.data);
    return;
  }
  receiveExternalAgentConfigsLoadFailure(
    "Failed to load external agent configs",
  );
}

export async function loadExternalAgentHealth(force: boolean = false) {
  const state = useAIStore.getState();
  if (state.externalAgentHealthLoading) {
    return;
  }
  if (!force && state.externalAgentHealthInitialLoadComplete) {
    return;
  }
  useAIStore.setState({ externalAgentHealthLoading: true });
  const res = await route_get_external_agent_health();
  if (res200(res)) {
    receiveExternalAgentHealthUpdate(res.data);
    return;
  }
  receiveExternalAgentHealthLoadFailure("Failed to load external agent health");
}

export function receiveExternalAgentConfigsUpdate(
  payload: Array<ExternalAgentConfig>,
) {
  applyExternalAgentConfigsUpdate(payload);
  void loadExternalAgentHealth(true);
}

export async function loadEngineConfigs(force: boolean = false) {
  const state = useAIStore.getState();
  if (state.engineConfigsLoading) {
    return;
  }
  if (!force && state.engineConfigsInitialLoadComplete) {
    return;
  }
  useAIStore.setState({ engineConfigsLoading: true });
  const res = await route_get_engine_configs();
  if (res200(res)) {
    receiveEngineConfigsUpdate(res.data);
    return;
  }
  receiveEngineConfigsLoadFailure("Failed to load engine configs");
}
