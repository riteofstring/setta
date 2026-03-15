import { useAIStore } from "state/stores/aiStores";
import {
  type AgentProfile,
  type EngineConfig,
  type ExternalAgentConfig,
  type ExternalAgentPreflightStatus,
  type PromptTemplate,
} from "utils/generatedTypes";

type HasId = { id: string };

function upsertById<T extends HasId>(items: Array<T>, entry: T): Array<T> {
  const index = items.findIndex((item) => item.id === entry.id);
  if (index === -1) {
    return [...items, entry];
  }
  const next = [...items];
  next[index] = entry;
  return next;
}

function removeById<T extends HasId>(items: Array<T>, id: string): Array<T> {
  return items.filter((item) => item.id !== id);
}

export function receiveAgentProfilesUpdate(payload: Array<AgentProfile>) {
  useAIStore.setState({
    agentProfiles: payload,
    agentProfilesInitialLoadComplete: true,
    agentProfilesLoadError: null,
    agentProfilesLoading: false,
  });
}

export function receiveAgentProfilesLoadFailure(message: string) {
  useAIStore.setState({
    agentProfilesInitialLoadComplete: true,
    agentProfilesLoadError: message,
    agentProfilesLoading: false,
  });
}

export function upsertAgentProfile(profile: AgentProfile) {
  useAIStore.setState((state) => ({
    agentProfiles: upsertById(state.agentProfiles, profile),
    agentProfilesInitialLoadComplete: true,
    agentProfilesLoadError: null,
  }));
}

export function removeAgentProfile(profileId: string) {
  useAIStore.setState((state) => ({
    agentProfiles: removeById(state.agentProfiles, profileId),
    agentProfilesInitialLoadComplete: true,
    agentProfilesLoadError: null,
  }));
}

export function receivePromptTemplatesUpdate(payload: Array<PromptTemplate>) {
  useAIStore.setState({
    promptTemplates: payload,
    promptTemplatesInitialLoadComplete: true,
    promptTemplatesLoadError: null,
    promptTemplatesLoading: false,
  });
}

export function receivePromptTemplatesLoadFailure(message: string) {
  useAIStore.setState({
    promptTemplatesInitialLoadComplete: true,
    promptTemplatesLoadError: message,
    promptTemplatesLoading: false,
  });
}

export function upsertPromptTemplate(template: PromptTemplate) {
  useAIStore.setState((state) => ({
    promptTemplates: upsertById(state.promptTemplates, template),
    promptTemplatesInitialLoadComplete: true,
    promptTemplatesLoadError: null,
  }));
}

export function removePromptTemplate(templateId: string) {
  useAIStore.setState((state) => ({
    promptTemplates: removeById(state.promptTemplates, templateId),
    promptTemplatesInitialLoadComplete: true,
    promptTemplatesLoadError: null,
  }));
}

export function receiveExternalAgentConfigsUpdate(
  payload: Array<ExternalAgentConfig>,
) {
  useAIStore.setState({
    externalAgentConfigs: payload,
    externalAgentConfigsInitialLoadComplete: true,
    externalAgentConfigsLoadError: null,
    externalAgentConfigsLoading: false,
  });
}

export function receiveExternalAgentConfigsLoadFailure(message: string) {
  useAIStore.setState({
    externalAgentConfigsInitialLoadComplete: true,
    externalAgentConfigsLoadError: message,
    externalAgentConfigsLoading: false,
  });
}

export function upsertExternalAgentConfig(config: ExternalAgentConfig) {
  useAIStore.setState((state) => ({
    externalAgentConfigs: upsertById(state.externalAgentConfigs, config),
    externalAgentConfigsInitialLoadComplete: true,
    externalAgentConfigsLoadError: null,
  }));
}

export function removeExternalAgentConfig(configId: string) {
  useAIStore.setState((state) => ({
    externalAgentConfigs: removeById(state.externalAgentConfigs, configId),
    externalAgentConfigsInitialLoadComplete: true,
    externalAgentConfigsLoadError: null,
  }));
}

export function receiveExternalAgentHealthUpdate(
  payload: Array<ExternalAgentPreflightStatus>,
) {
  useAIStore.setState({
    externalAgentHealth: payload,
    externalAgentHealthInitialLoadComplete: true,
    externalAgentHealthLoadError: null,
    externalAgentHealthLoading: false,
  });
}

export function receiveExternalAgentHealthLoadFailure(message: string) {
  useAIStore.setState({
    externalAgentHealthInitialLoadComplete: true,
    externalAgentHealthLoadError: message,
    externalAgentHealthLoading: false,
  });
}

export function receiveEngineConfigsUpdate(payload: Array<EngineConfig>) {
  useAIStore.setState({
    engineConfigs: payload,
    engineConfigsInitialLoadComplete: true,
    engineConfigsLoadError: null,
    engineConfigsLoading: false,
  });
}

export function receiveEngineConfigsLoadFailure(message: string) {
  useAIStore.setState({
    engineConfigsInitialLoadComplete: true,
    engineConfigsLoadError: message,
    engineConfigsLoading: false,
  });
}

export function upsertEngineConfig(config: EngineConfig) {
  useAIStore.setState((state) => ({
    engineConfigs: upsertById(state.engineConfigs, config),
    engineConfigsInitialLoadComplete: true,
    engineConfigsLoadError: null,
  }));
}
