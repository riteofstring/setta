import {
  invokePluginSettingRevealHandler,
  usePluginRuntimeStore,
} from "plugins/runtime";
import { useActiveSectionUI } from "state/activeSectionUI";
import { useLocalStorage, useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { createProjectStateBackendUpdate } from "testUtils/projectStateBackendUpdate";
import type {
  SectionType,
  UISettingRevealContent,
  UISettingRevealTarget,
} from "utils/generatedTypes";
import {
  createCodeSectionImpl,
  createCore,
  createSingleConfig,
  createVariant,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { vi } from "vitest";

const invokePluginSettingRevealHandlerMock = vi.hoisted(() =>
  vi.fn(async (args: { pluginId: string }) => ({
    ok: false,
    message: `Plugin ${args.pluginId} has no setting reveal handlers.`,
  })),
);

vi.mock("plugins/runtime", async () => {
  const actual =
    await vi.importActual<typeof import("plugins/runtime")>("plugins/runtime");
  return {
    ...actual,
    invokePluginSettingRevealHandler: invokePluginSettingRevealHandlerMock,
  };
});

type PluginRevealInvokeArgs = Parameters<
  typeof invokePluginSettingRevealHandler
>[0];

export type UISettingRevealModule = typeof import("./uiSettingReveal");

export function getInvokePluginSettingRevealHandlerMock() {
  return invokePluginSettingRevealHandlerMock;
}

export function getInvokePluginSettingRevealHandler() {
  return invokePluginSettingRevealHandler;
}

export function getPluginRuntimeStore() {
  return usePluginRuntimeStore;
}

export async function setupUISettingRevealTest(): Promise<UISettingRevealModule> {
  const module = await import("./uiSettingReveal");
  vi.useFakeTimers();
  resetProjectStores();
  useProjectState.setState((state) => {
    state.projectConfig.id = "project-1";
  });
  usePluginRuntimeStore.setState({ sortedPaneTabs: [] });
  useLocalStorage.setState({
    overviewVis: false,
    overviewTab: "Overview",
    uiEditorVis: false,
    projectChatAuxViewByProjectConfigId: {},
    runInstructionsAccordionOpenValuesByProjectConfigId: {},
    projectAiSettingsAccordionOpenValuesByProjectConfigId: {},
  });
  const windowRef = globalThis as unknown as {
    window: typeof globalThis & {
      matchMedia?: (query: string) => {
        matches: boolean;
      };
    };
  };
  windowRef.window = globalThis;
  windowRef.window.matchMedia = vi.fn(() => ({ matches: false }));
  const docRef = globalThis as unknown as {
    document: {
      querySelector: (selector: string) => HTMLElement | null;
    };
  };
  docRef.document = {
    querySelector: vi.fn(() => null),
  };
  invokePluginSettingRevealHandlerMock.mockImplementation(
    async (args: PluginRevealInvokeArgs) => ({
      ok: false,
      message: `Plugin ${args.pluginId} has no setting reveal handlers.`,
    }),
  );
  return module;
}

export function cleanupUISettingRevealTest(): void {
  resetProjectStores();
  usePluginRuntimeStore.setState({ sortedPaneTabs: [] });
  vi.clearAllMocks();
  vi.useRealTimers();
}

export function createRevealTarget(
  overrides: Partial<UISettingRevealTarget>,
): UISettingRevealTarget {
  return {
    settingId: "plugin::setta-watch-code::files",
    side: "left",
    overviewTabKey: "Overview",
    uiEditorTabName: null,
    pluginId: null,
    paneId: null,
    strategy: "dom_anchor",
    anchorId: "plugin::setta-watch-code::files",
    pluginRevealKey: null,
    revealActivationSteps: [],
    ...overrides,
  };
}

export function createRevealContent(
  overrides: Partial<UISettingRevealContent>,
): UISettingRevealContent {
  return {
    projectConfigId: "project-1",
    chatId: null,
    reveals: [createRevealTarget({})],
    durationMs: 120,
    requestId: "request-1",
    ...overrides,
  };
}

export function createFakeAnchor(anchorId: string): HTMLElement {
  const classes = new Set<string>();
  const classList: DOMTokenList = {
    add: (...tokens: string[]) => {
      for (const token of tokens) {
        classes.add(token);
      }
    },
    contains: (token: string) => classes.has(token),
    remove: (...tokens: string[]) => {
      for (const token of tokens) {
        classes.delete(token);
      }
    },
    replace: vi.fn(() => false),
    supports: vi.fn(() => false),
    toggle: vi.fn(() => false),
    value: "",
    length: 0,
    item: vi.fn(() => null),
    [Symbol.iterator]: function* () {
      yield* classes.values();
    },
    forEach: vi.fn(),
    entries: vi.fn(),
    keys: vi.fn(),
    values: vi.fn(),
  } as unknown as DOMTokenList;
  return {
    dataset: {
      settingAnchor: anchorId,
    },
    classList,
    scrollIntoView: vi.fn(),
  } as unknown as HTMLElement;
}

export function createFakePaneRoot(
  anchor: HTMLElement,
  anchorId = "plugin::setta-watch-code::files",
): HTMLElement {
  return {
    querySelector: vi.fn((selector: string) => {
      if (selector === `[data-setting-anchor="${anchorId}"]`) {
        return anchor;
      }
      return null;
    }),
  } as unknown as HTMLElement;
}

export function setActiveSectionType(sectionType: SectionType): void {
  const sectionId = "section-active";
  const variantId = "variant-active";
  const implId = "impl-active";
  useProjectState.setState((state) => {
    state.projectConfig.id = "project-active";
    state.projectConfig.sectionVariantMap = {
      ...state.projectConfig.sectionVariantMap,
      [sectionId]: variantId,
    };
    state.sectionVariants[variantId] = createVariant({
      id: variantId,
      impl: implId,
      nonPresetImpls: [implId],
      name: "active-variant",
    });
    if (sectionType === SectionTypeEnum.Code) {
      state.sectionImpls[implId] = createCodeSectionImpl({
        id: implId,
      });
      return;
    }
    throw new Error(`Unsupported section type in test helper: ${sectionType}`);
  });
  useActiveSectionUI.setState({ activeIds: [sectionId] });
}

export function configureCodeSections({
  projectConfigId,
  sectionIds,
  activeIds,
}: {
  projectConfigId: string;
  sectionIds: Array<string>;
  activeIds: Array<string>;
}): void {
  useProjectState.setState((state) => {
    state.projectConfig.id = projectConfigId;
    for (const sectionId of sectionIds) {
      const variantId = `variant-${sectionId}`;
      const implId = `impl-${sectionId}`;
      state.sections[sectionId] = createCore({ id: sectionId });
      state.projectConfig.sectionVariantMap[sectionId] = variantId;
      state.sectionVariants[variantId] = createVariant({
        id: variantId,
        impl: implId,
        nonPresetImpls: [implId],
        name: `variant-${sectionId}`,
      });
      state.sectionImpls[implId] = createCodeSectionImpl({
        id: implId,
      });
    }
  });
  useActiveSectionUI.setState({ activeIds: [...activeIds] });
}

export function buildBackendProjectStateUpdate({
  projectConfigId,
  activeIds,
  completedOpIds = [],
}: {
  projectConfigId: string;
  activeIds: Array<string>;
  completedOpIds?: Array<string>;
}) {
  const currentState = useProjectState.getState();
  return createProjectStateBackendUpdate({
    projectState: createSingleConfig({
      projectConfig: {
        ...currentState.projectConfig,
        id: projectConfigId,
        activeIds: [...activeIds],
      },
      sections: { ...currentState.sections },
      sectionImpls: { ...currentState.sectionImpls },
      sectionVariants: { ...currentState.sectionVariants },
      codeObjs: { ...currentState.codeObjs },
      codeObjImpls: { ...currentState.codeObjImpls },
      codeObjVariants: { ...currentState.codeObjVariants },
      artifactGroups: { ...currentState.artifactGroups },
      singletonSections: currentState.singletonSections,
      parentSectionMap: { ...currentState.parentSectionMap },
      shownParamIds: { ...currentState.shownParamIds },
      requiredDecodedImages: [...currentState.requiredDecodedImages],
      genCodeBinding: currentState.genCodeBinding ?? null,
    }),
    completedOpIds,
  });
}
