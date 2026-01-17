import { IdNameCombobox } from "components/Utils/Combobox/IdNameCombobox";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useProjectState, useShareSession } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import { res200 } from "utils/endpointUtils";
import {
  route_list_agent_profiles,
  route_set_chat_section_settings,
} from "utils/generatedEndpoints";
import { AgentProfile, SectionTypeEnum } from "utils/generatedTypes";
import { shallow } from "zustand/shallow";

type ChatAreaSettingsProps = {
  sectionId: string;
};

type ChatSectionSettingsPayload = {
  agentProfileId: string | null;
  agentRunId: string | null;
};

export function ChatAreaSettings({ sectionId }: ChatAreaSettingsProps) {
  const projectConfigId = getCurrProjectConfigId();
  const { canEditParams } = useShareCapabilities();
  const isShareMode = useShareSession((x) => x.isShareMode);
  const [agentProfiles, setAgentProfiles] = useState<AgentProfile[]>([]);
  const [profilesError, setProfilesError] = useState<string | null>(null);

  const { agentProfileId, agentRunId, isFrozen } = useProjectState((state) => {
    const impl = getCurrEffectiveSectionImplOfType(
      state,
      sectionId,
      SectionTypeEnum.Chat,
    );
    return {
      agentProfileId: impl.agentProfileId,
      agentRunId: impl.agentRunId,
      isFrozen: impl.isFrozen,
    };
  }, shallow);

  useEffect(() => {
    let active = true;
    const loadProfiles = async () => {
      const res = await route_list_agent_profiles();
      if (!active) {
        return;
      }
      if (res200(res)) {
        setAgentProfiles(res.data);
        setProfilesError(null);
        return;
      }
      setProfilesError("Failed to load agent profiles");
    };
    void loadProfiles();
    return () => {
      active = false;
    };
  }, []);

  const profileGroups = useMemo(
    () => [
      {
        group: "Agent Profiles",
        items: agentProfiles.map((profile) => ({
          id: profile.id,
          name: profile.name,
        })),
      },
    ],
    [agentProfiles],
  );

  const canEditSettings = !isShareMode || canEditParams;
  const isDisabled = isFrozen || !canEditSettings;
  let profilePlaceholder = "Select an agent profile";
  if (profilesError) {
    profilePlaceholder = profilesError;
  } else if (agentProfiles.length === 0) {
    profilePlaceholder = "Create an agent profile first";
  }

  const updateSettings = useCallback(
    (nextSettings: ChatSectionSettingsPayload) => {
      if (isDisabled) {
        return;
      }
      dispatchOptimisticProjectStateUpdate({
        apply: (state) => {
          setCurrEffectiveSectionImplValue<"ChatSection">(state, sectionId, {
            agentProfileId: nextSettings.agentProfileId,
            agentRunId: nextSettings.agentRunId,
          });
        },
        send: (frontendOpId) =>
          route_set_chat_section_settings({
            projectConfigId,
            sectionId,
            agentProfileId: nextSettings.agentProfileId,
            agentRunId: nextSettings.agentRunId,
            frontendOpId,
          }),
      });
    },
    [isDisabled, projectConfigId, sectionId],
  );

  const handleAgentProfileChange = useCallback(
    (value: string | null) => {
      updateSettings({ agentProfileId: value, agentRunId: null });
    },
    [updateSettings],
  );

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex w-full flex-col gap-2">
        <p className="text-xs font-bold text-setta-700 dark:text-setta-300">
          Agent Profile
        </p>
        <IdNameCombobox
          allItems={profileGroups}
          value={agentProfileId ?? null}
          small={false}
          onSelectedItemChange={handleAgentProfileChange}
          placeholder={profilePlaceholder}
          outerDivClasses="justify-center"
          isDisabled={isDisabled}
          selectedItemCanBeNull
        />
      </div>
      {agentRunId ? (
        <p className="text-xs text-setta-500 dark:text-setta-400">
          Active run: {agentRunId}
        </p>
      ) : null}
    </div>
  );
}
