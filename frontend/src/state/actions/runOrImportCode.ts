import { getSectionRect } from "forks/xyflow/core/utils/graph";
import {
  useLocalStorage,
  useNodeInternals,
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
  route_set_code_section_attached_terminal,
} from "utils/generatedEndpoints";
import {
  BinaryContentRef,
  Position,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { collectDrawSnapshotPayloads } from "./drawSnapshots";
import { triggerListenerForceRefresh } from "./listeners";
import { addTemporaryNotification } from "./notifications";
import {
  createNodesMapFromProjectConfigChildren,
  getCurrEffectiveSectionImpl,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "./sectionInfos";
import {
  createTopLevelSection,
  getEmptySpacePosition,
} from "./sections/createSections";

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

const ATTACHED_TERMINAL_X_OFFSET = 24;
const DEFAULT_CODE_SECTION_WIDTH = 500;

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
  if (impl.type !== SectionTypeEnum.Code) {
    return null;
  }
  const existingTerminalId = resolveAttachedTerminalId(
    state,
    resolvedSectionId,
  );
  if (existingTerminalId) {
    return existingTerminalId;
  }
  const position = resolveAttachedTerminalPosition(resolvedSectionId);
  const newTerminalId = await createTopLevelSection({
    implType: SectionTypeEnum.Terminal,
    implOverrides: null,
    position,
  });
  if (!newTerminalId) {
    return null;
  }
  await route_set_code_section_attached_terminal({
    projectConfigId: projectConfig.id,
    sectionId: resolvedSectionId,
    terminalSectionId: newTerminalId,
  });
  useProjectState.setState((state) => {
    setCurrEffectiveSectionImplValue<"BaseCodeSection">(
      state,
      resolvedSectionId,
      {
        attachedTerminalSectionId: newTerminalId,
      },
    );
  });
  useNodeInternals.setState((state) => ({
    x: createNodesMapFromProjectConfigChildren(
      useProjectState.getState(),
      state.x,
    ),
  }));
  return newTerminalId;
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

function resolveAttachedTerminalPosition(sectionId: string): Position | null {
  const rect = getSectionRect(sectionId);
  if (rect) {
    return {
      x: rect.x + rect.width + ATTACHED_TERMINAL_X_OFFSET,
      y: rect.y,
    };
  }
  const state = useProjectState.getState();
  const layout = state.projectConfig.topLevelSections[sectionId];
  if (layout) {
    const baseWidth = layout.w ?? DEFAULT_CODE_SECTION_WIDTH;
    return {
      x: layout.x + baseWidth + ATTACHED_TERMINAL_X_OFFSET,
      y: layout.y,
    };
  }
  return getEmptySpacePosition();
}
