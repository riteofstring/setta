import _ from "lodash";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAIStore } from "state/definitions";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import {
  route_get_global_capability_defaults,
  route_get_skills_catalog,
} from "utils/generatedEndpoints";
import {
  createGlobalCapabilityDefaults,
  GlobalCapabilityDefaults,
  SkillEntry,
  SkillSource,
} from "utils/generatedTypes";

type CapabilitiesCatalogState = {
  skills: SkillEntry[];
  sources: SkillSource[];
  defaultValues: GlobalCapabilityDefaults;
  mcpServerIds: string[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

function normalizeCatalogErrorMessage(message: string): string {
  const trimmed = message.trim();
  const unquoted = trimmed.replace(/^["']+|["']+$/g, "");
  if (
    unquoted.toLowerCase() === "not found" ||
    /\b404\b/.test(unquoted.toLowerCase())
  ) {
    return "Capabilities endpoints returned 404. Restart backend and reload.";
  }
  return unquoted;
}

export function useCapabilitiesCatalog(): CapabilitiesCatalogState {
  const allLLMConfigs = useAIStore((state) => state.allLLMConfigs, _.isEqual);
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [sources, setSources] = useState<SkillSource[]>([]);
  const [defaultValues, setDefaultValues] = useState<GlobalCapabilityDefaults>(
    createGlobalCapabilityDefaults(),
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const mcpServerIds = useMemo(() => {
    if (!allLLMConfigs) {
      return [];
    }
    return Object.keys(allLLMConfigs.mcpServers);
  }, [allLLMConfigs]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [catalogRes, defaultsRes] = await Promise.all([
        route_get_skills_catalog(),
        route_get_global_capability_defaults(),
      ]);
      if (!res200(catalogRes)) {
        const detail =
          getErrorDetail(catalogRes.data as unknown) ??
          "Failed to load skills.";
        setError(normalizeCatalogErrorMessage(detail));
        return;
      }
      if (!res200(defaultsRes)) {
        const detail =
          getErrorDetail(defaultsRes.data as unknown) ??
          "Failed to load global capability defaults.";
        setError(normalizeCatalogErrorMessage(detail));
        return;
      }
      setSkills(catalogRes.data.skills ?? []);
      setSources(catalogRes.data.sources ?? []);
      setDefaultValues(defaultsRes.data);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(normalizeCatalogErrorMessage(message));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    skills,
    sources,
    defaultValues,
    mcpServerIds,
    loading,
    error,
    refresh,
  };
}
