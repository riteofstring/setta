import { useEffect } from "react";
import {
  loadAgentProfiles,
  loadExternalAgentConfigs,
  loadPromptTemplates,
} from "state/actions/ai";
import { useAIStore } from "state/definitions";

export function useHydrateAgenticState() {
  const {
    agentProfilesInitialLoadComplete,
    promptTemplatesInitialLoadComplete,
    externalAgentConfigsInitialLoadComplete,
  } = useAIStore((x) => ({
    agentProfilesInitialLoadComplete: x.agentProfilesInitialLoadComplete,
    promptTemplatesInitialLoadComplete: x.promptTemplatesInitialLoadComplete,
    externalAgentConfigsInitialLoadComplete:
      x.externalAgentConfigsInitialLoadComplete,
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
  }, [
    agentProfilesInitialLoadComplete,
    promptTemplatesInitialLoadComplete,
    externalAgentConfigsInitialLoadComplete,
  ]);
}
