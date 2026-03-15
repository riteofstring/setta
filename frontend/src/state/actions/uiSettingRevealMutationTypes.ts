import { useLocalStorage } from "state/stores/uiPreferenceStores";
import type { UISettingRevealResultStatus } from "./uiSettingRevealShared";

type LocalStorageState = ReturnType<typeof useLocalStorage.getState>;

export type RevealLocalStorageSnapshot = {
  overviewVis: LocalStorageState["overviewVis"];
  overviewTab: LocalStorageState["overviewTab"];
  watchCodePortalOpen: LocalStorageState["watchCodePortalOpen"];
  uiEditorVis: LocalStorageState["uiEditorVis"];
  uiEditorTab: LocalStorageState["uiEditorTab"];
  projectChatAuxViewByProjectConfigId: LocalStorageState["projectChatAuxViewByProjectConfigId"];
  runInstructionsAccordionOpenValuesByProjectConfigId: LocalStorageState["runInstructionsAccordionOpenValuesByProjectConfigId"];
  projectAiSettingsAccordionOpenValuesByProjectConfigId: LocalStorageState["projectAiSettingsAccordionOpenValuesByProjectConfigId"];
};

export type RevealProjectStateSnapshot = {
  projectConfigId: string;
  activeIds: Array<string>;
};

export type RevealMutationDiff = {
  touchedOverviewVis: boolean;
  touchedOverviewTab: boolean;
  touchedWatchCodePortalOpen: boolean;
  touchedUiEditorVis: boolean;
  touchedUiEditorTabSectionTypes: Set<string>;
  touchedProjectChatAuxViewProjectConfigIds: Set<string>;
  touchedRunInstructionsProjectConfigIds: Set<string>;
  touchedProjectAiProjectConfigIds: Set<string>;
  touchedProjectStateActiveIdsProjectConfigIds: Set<string>;
};

export type RevealMutationLease = {
  leaseId: number;
  localStorageSnapshot: RevealLocalStorageSnapshot;
  postMutationLocalStorageSnapshot: RevealLocalStorageSnapshot;
  projectStateSnapshot: RevealProjectStateSnapshot;
  postMutationProjectStateSnapshot: RevealProjectStateSnapshot;
  mutationDiff: RevealMutationDiff;
};

export type RevealMutationResult =
  | {
      ok: true;
      lease: RevealMutationLease;
    }
  | {
      ok: false;
      status: UISettingRevealResultStatus;
    };
