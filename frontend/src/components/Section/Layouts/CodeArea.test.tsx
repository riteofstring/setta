import { buildLspDiagnosticsExtensions } from "components/Utils/CodeMirror/lspDiagnostics";
import { renderToStaticMarkup } from "react-dom/server";
import {
  useLspDiagnostics,
  useProjectState,
  useShareSession,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  CodeLanguageEnum,
  createProjectConfig,
  SectionTypeEnum,
  type Core,
  type SettaLspDiagnostic,
  type Variant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CodeArea } from "./CodeArea";

function syncStoreInitialState(store: {
  getState: () => Record<string, unknown>;
  getInitialState?: () => Record<string, unknown>;
}) {
  if (!store.getInitialState) {
    return;
  }
  const initial = store.getInitialState();
  Object.assign(initial, store.getState());
}

let lastCodeMirrorProps: Record<string, unknown> | null = null;

vi.mock("@uiw/react-codemirror", async () => {
  const React = await import("react");
  return {
    default: (props: Record<string, unknown>) => {
      lastCodeMirrorProps = props;
      return React.createElement("div", { "data-testid": "codemirror" });
    },
  };
});

vi.mock("components/Utils/CodeMirror/getExtensions", () => ({
  getExtensions: () => ["base-extension"],
}));

vi.mock("components/Utils/CodeMirror/useCodeMirrorStyle", () => ({
  useCodeMirrorStyle: () => "theme",
}));

vi.mock("forks/xyflow/core/store", () => ({
  useReactFlow: (
    selector: (state: {
      fitViewOnInit: boolean;
      fitViewOnInitDone: boolean;
    }) => boolean,
  ) => selector({ fitViewOnInit: false, fitViewOnInitDone: false }),
}));

vi.mock("state/hooks/sectionSizes", () => ({
  useSectionMinMaxDims: () => ({ maxHeight: 600, maxWidth: 800 }),
  getMinSectionHeight: () => 120,
}));

describe("CodeArea LSP diagnostics wiring", () => {
  const sectionId = "section-1";
  const variantId = "variant-1";
  const implId = "impl-1";

  const baseDiagnostic: SettaLspDiagnostic = {
    message: "Bad code",
    severity: 1,
    code: "reportFoo",
    source: "pyright",
    range: {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 1 },
    },
    uri: "file:///tmp/section.py",
  };

  const sectionCore: Core = {
    id: sectionId,
    name: "Section",
    displayName: "",
    variants: [variantId],
    defaultVariant: variantId,
    sharedModifier: {},
    unsharedKeys: [],
  };

  const sectionVariant: Variant = {
    id: variantId,
    name: "Variant",
    impl: implId,
    nonPresetImpls: [],
    modifier: {},
    isFrozen: false,
  };

  const sectionImpl = {
    type: SectionTypeEnum.Code,
    id: implId,
    name: "Code",
    isFrozen: false,
    isInOtherProjectConfigs: false,
    size: { width: 500, height: 300 },
    aspectRatio: false,
    aspectRatioExtraHeight: 0,
    aspectRatioExtraWidth: 0,
    isMinimized: false,
    positionAndSizeLocked: false,
    isPreset: false,
    code: "print('hi')",
    codeFileBinding: null,
    codeLanguage: CodeLanguageEnum.python,
    diagnosticsIgnoreState: {
      muted: false,
      suppressedCodes: [],
    },
  };

  beforeEach(() => {
    const projectConfig = createProjectConfig({
      id: "project-1",
      sectionVariantMap: { [sectionId]: variantId },
      topLevelSections: {
        [sectionId]: { x: 0, y: 0, zIndex: 0, w: null, h: null },
      },
    });

    resetProjectStores();
    lastCodeMirrorProps = null;
    useShareSession.setState({ isDeploymentMode: false });
    useProjectState.setState((state) => {
      state.projectConfig = projectConfig;
      state.sections = { [sectionId]: sectionCore };
      state.sectionVariants = { [variantId]: sectionVariant };
      state.sectionImpls = { [implId]: { ...sectionImpl } };
      state.previewSectionVariantMap = {};
    });
    useLspDiagnostics.setState({ codeSections: {}, unmappedGenCode: [] });
    syncStoreInitialState(useProjectState);
    syncStoreInitialState(useShareSession);
    syncStoreInitialState(useLspDiagnostics);
  });

  afterEach(() => {
    resetProjectStores();
    lastCodeMirrorProps = null;
  });

  it("appends lint extensions when diagnostics exist", () => {
    useLspDiagnostics.setState({
      codeSections: { [sectionId]: [baseDiagnostic] },
      unmappedGenCode: [],
    });
    syncStoreInitialState(useLspDiagnostics);

    const state = useProjectState.getState();
    expect(state.projectConfig.sectionVariantMap[sectionId]).toBe(variantId);

    renderToStaticMarkup(<CodeArea sectionId={sectionId} />);

    const props = lastCodeMirrorProps;
    expect(props).not.toBeNull();
    const extensions = Array.isArray(props?.extensions)
      ? props?.extensions
      : [];
    const lspExtensions = buildLspDiagnosticsExtensions([baseDiagnostic]);
    expect(extensions.length).toBe(1 + lspExtensions.length);
  });

  it("skips lint extensions in share mode", () => {
    useShareSession.setState({ isDeploymentMode: true });
    syncStoreInitialState(useShareSession);
    useLspDiagnostics.setState({
      codeSections: { [sectionId]: [baseDiagnostic] },
      unmappedGenCode: [],
    });
    syncStoreInitialState(useLspDiagnostics);

    const state = useProjectState.getState();
    expect(state.projectConfig.sectionVariantMap[sectionId]).toBe(variantId);

    renderToStaticMarkup(<CodeArea sectionId={sectionId} />);

    const props = lastCodeMirrorProps;
    expect(props).not.toBeNull();
    const extensions = Array.isArray(props?.extensions)
      ? props?.extensions
      : [];
    expect(extensions.length).toBe(1);
  });
});
