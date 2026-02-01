import {
  useLocalStorage,
  useProjectState,
  useRunControl,
  useSettings,
  useShareSession,
  type ZustandProjectState,
} from "state/definitions";
import { projectConfigHasPythonCodegen } from "utils/codegenTargets";
import { isRunnableCodeLanguage } from "utils/codeLanguage";
import {
  route_kill_subprocesses,
  route_run_code,
} from "utils/generatedEndpoints";
import { BinaryContentRef, SectionTypeEnum } from "utils/generatedTypes";
import { collectDrawSnapshotPayloads } from "./drawSnapshots";
import { triggerListenerForceRefresh } from "./listeners";
import { addTemporaryNotification } from "./notifications";
import {
  getCurrEffectiveSectionImpl,
  getCurrProjectConfigId,
} from "./sectionInfos";

export async function runCodeBlock(sectionId: string | null) {
  const { projectConfig, singletonSections } = useProjectState.getState();
  if (sectionId) {
    const impl = getCurrEffectiveSectionImpl(
      useProjectState.getState(),
      sectionId,
    );
    if (
      impl.type === SectionTypeEnum.Code &&
      !isRunnableCodeLanguage(impl.codeLanguage)
    ) {
      addTemporaryNotification("Run is only available for Python and Bash.");
      return;
    }
  } else if (projectConfig.entryCodeBlockId) {
    const entryImpl = getCurrEffectiveSectionImpl(
      useProjectState.getState(),
      projectConfig.entryCodeBlockId,
    );
    if (
      entryImpl.type === SectionTypeEnum.Code &&
      !isRunnableCodeLanguage(entryImpl.codeLanguage)
    ) {
      addTemporaryNotification("Run is only available for Python and Bash.");
      return;
    }
  }

  const pythonCodegenEnabled = projectConfigHasPythonCodegen(projectConfig);
  if (!pythonCodegenEnabled) {
    const gen_section_id = singletonSections.GenPythonCode;
    if (sectionId !== null && sectionId === gen_section_id) {
      addTemporaryNotification("Select a manual code section to run.");
      return;
    }
    if (
      sectionId === null &&
      (!projectConfig.entryCodeBlockId ||
        projectConfig.entryCodeBlockId === gen_section_id)
    ) {
      addTemporaryNotification("Select a manual entry code block to run.");
      return;
    }
  }
  if (pythonCodegenEnabled && sectionId === singletonSections.GenPythonCode) {
    sectionId = null;
  }
  const shareSession = useShareSession.getState();
  let runSnapshotMode = null;
  if (!shareSession.isShareMode) {
    const overrides =
      useLocalStorage.getState().runSnapshotModeByProjectConfigId;
    const runSnapshotOverride = overrides[projectConfig.id];
    if (runSnapshotOverride !== undefined) {
      runSnapshotMode = runSnapshotOverride;
    } else {
      runSnapshotMode = useSettings.getState().backend.runSnapshotMode;
    }
  }
  const terminalSectionId = await ensureAttachedTerminalForRun({
    sectionId,
    projectConfig,
  });
  const drawSnapshotsBySectionId = await collectDrawSnapshotsForRun();
  await route_run_code({
    projectConfigId: projectConfig.id,
    sectionId,
    terminalSectionId,
    cliId: null,
    runSnapshotMode,
    drawSnapshotsBySectionId,
  });
}

export async function runEntryCodeBlock() {
  await runCodeBlock(null);
}

export async function runFromMainRunButton(): Promise<void> {
  const { runMode, continuousRunStarted } = useRunControl.getState();
  if (runMode === "continuous") {
    if (continuousRunStarted) {
      useRunControl.setState({
        continuousRunStarted: false,
        continuousRunCustomRunId: null,
      });
      return;
    }

    useRunControl.setState({
      continuousRunStarted: true,
      continuousRunCustomRunId: null,
    });
    await triggerListenerForceRefresh();
    return;
  }

  useRunControl.setState({
    continuousRunStarted: false,
    continuousRunCustomRunId: null,
  });
  await runEntryCodeBlock();
}

export async function stopCode() {
  addTemporaryNotification("Stopping subprocesses");
  route_kill_subprocesses({
    projectConfigId: getCurrProjectConfigId(),
  });
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

function logAttachedTerminal(payload: Record<string, unknown>) {
  console.info(
    JSON.stringify({
      event: "attached-terminal",
      ...payload,
    }),
  );
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
  logAttachedTerminal({
    stage: "resolve-section",
    sectionId,
    resolvedSectionId,
    projectConfigId: projectConfig.id,
  });
  if (!resolvedSectionId) {
    return null;
  }
  const state = useProjectState.getState();
  const impl = getCurrEffectiveSectionImpl(state, resolvedSectionId);
  if (impl.type !== SectionTypeEnum.Code) {
    logAttachedTerminal({
      stage: "non-code-section",
      resolvedSectionId,
      sectionType: impl.type,
    });
    return null;
  }
  const existingTerminalId = resolveAttachedTerminalId(
    state,
    resolvedSectionId,
  );
  if (existingTerminalId) {
    logAttachedTerminal({
      stage: "existing-terminal",
      resolvedSectionId,
      terminalSectionId: existingTerminalId,
    });
    return existingTerminalId;
  }
  logAttachedTerminal({
    stage: "await-backend-attach",
    resolvedSectionId,
    reason: "backend-run",
  });
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
  if (impl.type !== SectionTypeEnum.Code) {
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
