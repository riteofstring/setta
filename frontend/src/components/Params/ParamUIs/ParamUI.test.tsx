import { renderToStaticMarkup } from "react-dom/server";
import { useMisc, useProjectState, useShareSession } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  createCallableSectionImpl,
  createCodeParamCodeObjImpl,
  createCore,
  createProjectConfig,
  createUserDefaultCallableSectionImpl,
  createUserDefaultCodeParamCodeObjImpl,
  createVariant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ParamUI } from "./ParamUI";

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

function seedParamUIState({
  allowUnquotedStringArgs,
  typeAnnotation,
}: {
  allowUnquotedStringArgs: boolean;
  typeAnnotation: string;
}) {
  const sectionId = "section-1";
  const sectionVariantId = "section-variant-1";
  const sectionImplId = "section-impl-1";
  const paramId = "param-1";
  const paramVariantId = "param-variant-1";
  const paramImplId = "param-impl-1";

  const projectConfig = createProjectConfig({
    id: "project-1",
    sectionVariantMap: { [sectionId]: sectionVariantId },
    topLevelSections: {
      [sectionId]: { x: 0, y: 0, zIndex: 0, w: null, h: null },
    },
  });
  const sectionCore = createCore({
    id: sectionId,
    name: "Callable",
    variants: [sectionVariantId],
    defaultVariant: sectionVariantId,
  });
  const sectionVariant = createVariant({
    id: sectionVariantId,
    name: "Section Variant",
    impl: sectionImplId,
    nonPresetImpls: [],
  });
  const sectionImpl = createCallableSectionImpl(
    createUserDefaultCallableSectionImpl(),
    {
      id: sectionImplId,
      codeObjVariantMap: {
        [paramId]: paramVariantId,
      },
      allowUnquotedStringArgs,
    },
  );
  const paramCore = createCore({
    id: paramId,
    name: "path",
    variants: [paramVariantId],
    defaultVariant: paramVariantId,
  });
  const paramVariant = createVariant({
    id: paramVariantId,
    name: "Param Variant",
    impl: paramImplId,
    nonPresetImpls: [],
  });
  const paramImpl = createCodeParamCodeObjImpl(
    createUserDefaultCodeParamCodeObjImpl(),
    {
      id: paramImplId,
      typeAnnotation,
    },
  );

  useProjectState.setState((state) => {
    state.projectConfig = projectConfig;
    state.sections = { [sectionId]: sectionCore };
    state.sectionVariants = { [sectionVariantId]: sectionVariant };
    state.sectionImpls = { [sectionImplId]: sectionImpl };
    state.codeObjs = { [paramId]: paramCore };
    state.codeObjVariants = { [paramVariantId]: paramVariant };
    state.codeObjImpls = { [paramImplId]: paramImpl };
    state.parentSectionMap = { [sectionId]: null };
    state.previewSectionVariantMap = {};
  });
  syncStoreInitialState(useProjectState);
  return { sectionId, paramId };
}

describe("ParamUI unquoted string hint", () => {
  beforeEach(() => {
    resetProjectStores();
    useShareSession.setState({
      isDeploymentMode: false,
      sharePolicy: null,
      shareSessionId: null,
      sessionRunCount: 0,
      shareDeploymentName: null,
      shareDeploymentVersion: null,
      deploymentMode: null,
    });
    useMisc.setState({ isSelectingParams: false });
    syncStoreInitialState(useShareSession);
    syncStoreInitialState(useMisc);
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("shows hint when string annotation and section toggle are enabled", () => {
    const { sectionId, paramId } = seedParamUIState({
      allowUnquotedStringArgs: true,
      typeAnnotation: "typing.Optional[str]",
    });
    const markup = renderToStaticMarkup(
      <ParamUI
        sectionId={sectionId}
        paramInfoId={paramId}
        value=""
        onChange={vi.fn()}
      />,
    );
    expect(markup).toContain(
      "String annotation detected: quotes are optional in this section.",
    );
  });

  it("hides hint when annotation is not string-like", () => {
    const { sectionId, paramId } = seedParamUIState({
      allowUnquotedStringArgs: true,
      typeAnnotation: "int",
    });
    const markup = renderToStaticMarkup(
      <ParamUI
        sectionId={sectionId}
        paramInfoId={paramId}
        value=""
        onChange={vi.fn()}
      />,
    );
    expect(markup).not.toContain("quotes are optional in this section");
  });
});
