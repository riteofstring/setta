import { useEffect } from "react";
import { loadAgentProfiles, loadPromptTemplates } from "state/actions/ai";
import { useAIStore } from "state/definitions";

export function useHydrateAgenticState() {
  const {
    agentProfilesInitialLoadComplete,
    promptTemplatesInitialLoadComplete,
  } = useAIStore((x) => ({
    agentProfilesInitialLoadComplete: x.agentProfilesInitialLoadComplete,
    promptTemplatesInitialLoadComplete: x.promptTemplatesInitialLoadComplete,
  }));

  useEffect(() => {
    if (!agentProfilesInitialLoadComplete) {
      void loadAgentProfiles();
    }
    if (!promptTemplatesInitialLoadComplete) {
      void loadPromptTemplates();
    }
  }, [agentProfilesInitialLoadComplete, promptTemplatesInitialLoadComplete]);
}
