import { useEffect } from "react";
import {
  loadAgentProfiles,
  loadEngineConfigs,
  loadExternalAgentConfigs,
  loadExternalAgentHealth,
  loadPromptTemplates,
} from "state/actions/ai";
import { useAIStore } from "state/definitions";

export function useHydrateAgenticState() {
  const {
    agentProfilesInitialLoadComplete,
    promptTemplatesInitialLoadComplete,
    externalAgentConfigsInitialLoadComplete,
    externalAgentHealthInitialLoadComplete,
    engineConfigsInitialLoadComplete,
  } = useAIStore((x) => ({
    agentProfilesInitialLoadComplete: x.agentProfilesInitialLoadComplete,
    promptTemplatesInitialLoadComplete: x.promptTemplatesInitialLoadComplete,
    externalAgentConfigsInitialLoadComplete:
      x.externalAgentConfigsInitialLoadComplete,
    externalAgentHealthInitialLoadComplete:
      x.externalAgentHealthInitialLoadComplete,
    engineConfigsInitialLoadComplete: x.engineConfigsInitialLoadComplete,
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
  }, [
    agentProfilesInitialLoadComplete,
    promptTemplatesInitialLoadComplete,
    externalAgentConfigsInitialLoadComplete,
    externalAgentHealthInitialLoadComplete,
    engineConfigsInitialLoadComplete,
  ]);
}
