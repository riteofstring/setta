import {
  useLocalStorage,
  useProjectState,
  useRunControl,
  useSettings,
  useShareSession,
} from "state/definitions";
import { projectConfigHasPythonCodegen } from "utils/codegenTargets";
import { isRunnableCodeLanguage } from "utils/codeLanguage";
import {
  route_kill_subprocesses,
  route_run_code,
} from "utils/generatedEndpoints";
import { SectionTypeEnum } from "utils/generatedTypes";
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
  const drawSnapshotsBySectionId = collectDrawSnapshotsForRun();
  await route_run_code({
    projectConfigId: projectConfig.id,
    sectionId,
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

function collectDrawSnapshotsForRun(): Record<string, string> | null {
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
  return collectDrawSnapshotPayloads(drawSectionIds);
}
