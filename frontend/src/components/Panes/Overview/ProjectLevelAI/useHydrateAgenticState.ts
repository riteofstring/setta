import { useEffect } from "react";
import {
  loadAgentProfiles,
  loadEngineConfigs,
  loadExternalAgentConfigs,
  loadExternalAgentHealth,
  loadPromptTemplates,
  loadTranscriptionProfiles,
} from "state/actions/ai";
import { useAIStore } from "state/definitions";

export function useHydrateAgenticState() {
  const {
    agentProfilesInitialLoadComplete,
    promptTemplatesInitialLoadComplete,
    externalAgentConfigsInitialLoadComplete,
    externalAgentHealthInitialLoadComplete,
    engineConfigsInitialLoadComplete,
    transcriptionProfilesInitialLoadComplete,
  } = useAIStore((x) => ({
    agentProfilesInitialLoadComplete: x.agentProfilesInitialLoadComplete,
    promptTemplatesInitialLoadComplete: x.promptTemplatesInitialLoadComplete,
    externalAgentConfigsInitialLoadComplete:
      x.externalAgentConfigsInitialLoadComplete,
    externalAgentHealthInitialLoadComplete:
      x.externalAgentHealthInitialLoadComplete,
    engineConfigsInitialLoadComplete: x.engineConfigsInitialLoadComplete,
    transcriptionProfilesInitialLoadComplete:
      x.transcriptionProfilesInitialLoadComplete,
  }));

  useEffect(() => {
    if (!agentProfilesInitialLoadComplete) {
      void loadAgentProfiles();
    }
    if (!promptTemplatesInitialLoadComplete) {
      void loadPromptTemplates();
    }
    if (!externalAgentConfigsInitialLoadComplete) {
      void loadExternalAgentConfigs();
    }
    if (!externalAgentHealthInitialLoadComplete) {
      void loadExternalAgentHealth();
    }
    if (!engineConfigsInitialLoadComplete) {
      void loadEngineConfigs();
    }
    if (!transcriptionProfilesInitialLoadComplete) {
      void loadTranscriptionProfiles();
    }
  }, [
    agentProfilesInitialLoadComplete,
    promptTemplatesInitialLoadComplete,
    externalAgentConfigsInitialLoadComplete,
    externalAgentHealthInitialLoadComplete,
    engineConfigsInitialLoadComplete,
    transcriptionProfilesInitialLoadComplete,
  ]);
}
