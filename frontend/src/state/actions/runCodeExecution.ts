import {
  useProjectState,
  useShareSession,
  type ZustandProjectState,
} from "state/definitions";
import { useLocalStorage, useSettings } from "state/stores/uiPreferenceStores";
import { projectConfigHasPythonCodegen } from "utils/codegenTargets";
import { isRunnableCodeLanguage } from "utils/codeLanguage";
import { route_run_code } from "utils/generatedEndpoints";
import { BinaryContentRef, SectionTypeEnum } from "utils/generatedTypes";
import { collectDrawSnapshotPayloads } from "./drawSnapshots";
import { addTemporaryNotification } from "./notifications";
import {
  getCurrEffectiveSectionImpl,
  isBaseCodeSectionType,
} from "./sectionInfos";

export async function runCodeBlock(sectionId: string | null) {
  const { projectConfig, singletonSections } = useProjectState.getState();

  if (!isRunnableRunTarget(sectionId, projectConfig.entryCodeBlockId)) {
    addTemporaryNotification("Run is only available for Python and Bash.");
    return;
  }

  const pythonCodegenEnabled = projectConfigHasPythonCodegen(projectConfig);
  if (!pythonCodegenEnabled) {
    const genSectionId = singletonSections.GenPythonCode;
    if (sectionId !== null && sectionId === genSectionId) {
      addTemporaryNotification("Select a manual code section to run.");
      return;
    }
    if (
      sectionId === null &&
      (!projectConfig.entryCodeBlockId ||
        projectConfig.entryCodeBlockId === genSectionId)
    ) {
      addTemporaryNotification("Select a manual entry code block to run.");
      return;
    }
  }

  const normalizedSectionId =
    pythonCodegenEnabled && sectionId === singletonSections.GenPythonCode
      ? null
      : sectionId;
  const terminalSectionId = await ensureAttachedTerminalForRun({
    sectionId: normalizedSectionId,
    projectConfig,
  });
  const drawSnapshotsBySectionId = await collectDrawSnapshotsForRun();

  await route_run_code({
    projectConfigId: projectConfig.id,
    sectionId: normalizedSectionId,
    terminalSectionId,
    cliId: null,
    runSnapshotMode: resolveRunSnapshotMode(projectConfig.id),
    drawSnapshotsBySectionId,
  });
}

export async function runEntryCodeBlock() {
  await runCodeBlock(null);
}

function isRunnableRunTarget(
  sectionId: string | null,
  entryCodeBlockId: string | null,
): boolean {
  if (sectionId !== null) {
    return isRunnableSection(sectionId);
  }
  if (entryCodeBlockId === null) {
    return true;
  }
  return isRunnableSection(entryCodeBlockId);
}

function isRunnableSection(sectionId: string): boolean {
  const impl = getCurrEffectiveSectionImpl(
    useProjectState.getState(),
    sectionId,
  );
  if (impl.type !== SectionTypeEnum.Code) {
    return true;
  }
  return isRunnableCodeLanguage(impl.codeLanguage);
}

function resolveRunSnapshotMode(projectConfigId: string) {
  const shareSession = useShareSession.getState();
  if (shareSession.isDeploymentMode) {
    return null;
  }

  const overrides = useLocalStorage.getState().runSnapshotModeByProjectConfigId;
  const runSnapshotOverride = overrides[projectConfigId];
  if (runSnapshotOverride !== undefined) {
    return runSnapshotOverride;
  }

  return useSettings.getState().backend.runSnapshotMode;
}

async function collectDrawSnapshotsForRun(): Promise<Record<
  string,
  BinaryContentRef
> | null> {
  const state = useProjectState.getState();
  const sectionIds = Object.keys(state.projectConfig.sectionVariantMap);
  const drawSectionIds = sectionIds.filter(
    (sectionId) =>
      getCurrEffectiveSectionImpl(state, sectionId).type ===
      SectionTypeEnum.Draw,
  );
  if (drawSectionIds.length === 0) {
    return null;
  }
  return await collectDrawSnapshotPayloads(drawSectionIds);
}

async function ensureAttachedTerminalForRun({
  sectionId,
  projectConfig,
}: {
  sectionId: string | null;
  projectConfig: ZustandProjectState["projectConfig"];
}): Promise<string | null> {
  const resolvedSectionId = resolveAttachmentSectionId(
    sectionId,
    projectConfig,
  );
  if (!resolvedSectionId) {
    return null;
  }

  const state = useProjectState.getState();
  const impl = getCurrEffectiveSectionImpl(state, resolvedSectionId);
  if (!isBaseCodeSectionType(impl.type)) {
    return null;
  }

  const existingTerminalId = resolveAttachedTerminalId(
    state,
    resolvedSectionId,
  );
  if (existingTerminalId) {
    return existingTerminalId;
  }
  return null;
}

function resolveAttachmentSectionId(
  sectionId: string | null,
  projectConfig: ZustandProjectState["projectConfig"],
): string | null {
  if (sectionId) {
    return sectionId;
  }
  if (!projectConfig.entryCodeBlockId) {
    return null;
  }
  return projectConfig.entryCodeBlockId;
}

function resolveAttachedTerminalId(
  state: ZustandProjectState,
  sectionId: string,
): string | null {
  const impl = getCurrEffectiveSectionImpl(state, sectionId);
  if (!isBaseCodeSectionType(impl.type)) {
    return null;
  }
  if (!impl.attachedTerminalSectionId) {
    return null;
  }

  const terminalId = impl.attachedTerminalSectionId;
  if (!(terminalId in state.sections)) {
    return null;
  }

  const terminalImpl = getCurrEffectiveSectionImpl(state, terminalId);
  if (terminalImpl.type !== SectionTypeEnum.Terminal) {
    return null;
  }
  return terminalId;
}
