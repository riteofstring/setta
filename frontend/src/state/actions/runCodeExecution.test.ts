import { useProjectState, useShareSession } from "state/definitions";
import { createDefaultUIPreferenceState } from "state/stores/uiPreferenceState";
import { useLocalStorage, useSettings } from "state/stores/uiPreferenceStores";
import { resetProjectStores } from "state/utils";
import {
  CodeLanguageEnum,
  SectionTypeEnum,
  createCodeSectionImpl,
  createCore,
  createProjectCodegenPythonTarget,
  createProjectConfig,
  createProjectStateSingleConfig,
  createSettingsState,
  createSingletonSections,
  createTerminalSectionImpl,
  createUserDefaultCodeSectionImpl,
  createVariant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runCodeBlock, runEntryCodeBlock } from "./runCodeExecution";

vi.mock("utils/generatedEndpoints", () => ({
  route_run_code: vi.fn(async () => ({
    data: null,
    hasResponse: true,
    status: 200,
  })),
}));

vi.mock("./notifications", () => ({
  addTemporaryNotification: vi.fn(),
}));

describe("runCodeExecution", () => {
  beforeEach(() => {
    resetProjectStores();
    useLocalStorage.setState(createDefaultUIPreferenceState());
    useSettings.setState(createSettingsState());
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("rejects direct runs for non-runnable code languages", async () => {
    // Non-shell/non-python code blocks should stop before the backend run request is sent.
    seedProjectState({
      sections: [
        {
          sectionId: "code-1",
          type: SectionTypeEnum.Code,
          codeLanguage: CodeLanguageEnum.markdown,
        },
      ],
    });

    await runCodeBlock("code-1");

    const { addTemporaryNotification } = await import("./notifications");
    const { route_run_code } = await import("utils/generatedEndpoints");
    expect(addTemporaryNotification).toHaveBeenCalledWith(
      "Run is only available for Python and Bash.",
    );
    expect(route_run_code).not.toHaveBeenCalled();
  });

  it("requires a manual entry block when python codegen is disabled", async () => {
    // Main-run entry resolution should reject singleton generated code when there is no python codegen target.
    seedProjectState({
      entryCodeBlockId: "gen-python",
      genPythonSectionId: "gen-python",
      codegenEnabled: false,
      sections: [
        {
          sectionId: "gen-python",
          type: SectionTypeEnum.Code,
          codeLanguage: CodeLanguageEnum.python,
        },
      ],
    });

    await runEntryCodeBlock();

    const { addTemporaryNotification } = await import("./notifications");
    const { route_run_code } = await import("utils/generatedEndpoints");
    expect(addTemporaryNotification).toHaveBeenCalledWith(
      "Select a manual entry code block to run.",
    );
    expect(route_run_code).not.toHaveBeenCalled();
  });

  it("normalizes generated-python runs to the entry flow and preserves attached terminals", async () => {
    // Generated-python singleton runs should route through the entry path while still carrying the linked terminal.
    const projectConfigId = "project-1";
    useLocalStorage.setState({
      ...createDefaultUIPreferenceState(),
      runSnapshotModeByProjectConfigId: {
        [projectConfigId]: "always",
      },
    });
    seedProjectState({
      projectConfigId,
      entryCodeBlockId: "gen-python",
      genPythonSectionId: "gen-python",
      codegenEnabled: true,
      sections: [
        {
          sectionId: "gen-python",
          type: SectionTypeEnum.Code,
          codeLanguage: CodeLanguageEnum.python,
          attachedTerminalSectionId: "terminal-1",
        },
        {
          sectionId: "terminal-1",
          type: SectionTypeEnum.Terminal,
        },
      ],
    });

    await runCodeBlock("gen-python");

    const { route_run_code } = await import("utils/generatedEndpoints");
    expect(route_run_code).toHaveBeenCalledWith({
      projectConfigId,
      sectionId: null,
      terminalSectionId: "terminal-1",
      cliId: null,
      runSnapshotMode: "always",
      drawSnapshotsBySectionId: null,
    });
  });

  it("drops snapshot mode overrides during deployment runs", async () => {
    // Share/app deployment runs should not send a snapshot mode override back to the backend.
    const projectConfigId = "project-1";
    useShareSession.setState({ isDeploymentMode: true });
    useLocalStorage.setState({
      ...createDefaultUIPreferenceState(),
      runSnapshotModeByProjectConfigId: {
        [projectConfigId]: "never",
      },
    });
    seedProjectState({
      projectConfigId,
      sections: [
        {
          sectionId: "code-1",
          type: SectionTypeEnum.Code,
          codeLanguage: CodeLanguageEnum.python,
        },
      ],
    });

    await runCodeBlock("code-1");

    const { route_run_code } = await import("utils/generatedEndpoints");
    expect(route_run_code).toHaveBeenCalledWith({
      projectConfigId,
      sectionId: "code-1",
      terminalSectionId: null,
      cliId: null,
      runSnapshotMode: null,
      drawSnapshotsBySectionId: null,
    });
  });
});

type SeedSection =
  | {
      sectionId: string;
      type: typeof SectionTypeEnum.Code;
      codeLanguage: string;
      attachedTerminalSectionId?: string | null;
    }
  | {
      sectionId: string;
      type: typeof SectionTypeEnum.Terminal;
    };

function seedProjectState({
  projectConfigId = "project-1",
  entryCodeBlockId = null,
  genPythonSectionId = "gen-python",
  codegenEnabled = false,
  sections,
}: {
  projectConfigId?: string;
  entryCodeBlockId?: string | null;
  genPythonSectionId?: string;
  codegenEnabled?: boolean;
  sections: SeedSection[];
}) {
  const sectionVariantMap: Record<string, string> = {};
  const state = createProjectStateSingleConfig({
    projectConfig: createProjectConfig({
      id: projectConfigId,
      entryCodeBlockId,
      sectionVariantMap,
      codegenTargets: codegenEnabled
        ? [createProjectCodegenPythonTarget()]
        : [],
    }),
    singletonSections: createSingletonSections({
      GenPythonCode: genPythonSectionId,
    }),
  });

  for (const section of sections) {
    const variantId = `variant-${section.sectionId}`;
    const implId = `impl-${section.sectionId}`;
    sectionVariantMap[section.sectionId] = variantId;
    state.projectConfig.sectionVariantMap[section.sectionId] = variantId;
    state.sections[section.sectionId] = createCore({
      id: section.sectionId,
      variants: [variantId],
      defaultVariant: variantId,
    });
    state.sectionVariants[variantId] = createVariant({
      id: variantId,
      impl: implId,
      nonPresetImpls: [implId],
      name: `variant-${section.sectionId}`,
    });
    state.parentSectionMap[section.sectionId] = null;

    if (section.type === SectionTypeEnum.Terminal) {
      state.sectionImpls[implId] = createTerminalSectionImpl({
        id: implId,
        type: SectionTypeEnum.Terminal,
      });
      continue;
    }

    state.sectionImpls[implId] = createCodeSectionImpl(
      createUserDefaultCodeSectionImpl({
        codeLanguage: section.codeLanguage,
        attachedTerminalSectionId: section.attachedTerminalSectionId ?? null,
      }),
      {
        id: implId,
        type: SectionTypeEnum.Code,
      },
    );
  }

  useProjectState.setState(state);
}
