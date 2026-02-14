import { renderToStaticMarkup } from "react-dom/server";
import { useProjectState, useShareSession } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  createCallableSectionImpl,
  SectionTypeEnum,
  createCore,
  createListRootSectionImpl,
  createProjectConfig,
  createTextBlockSectionImpl,
  createUserDefaultCallableSectionImpl,
  createUserDefaultListRootSectionImpl,
  createUserDefaultTextBlockSectionImpl,
  createVariant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChildDefaultsSettings } from "./ChildDefaultsSettings";
import { EdgePortsSettings } from "./EdgePortsSettings";
import { TextBlockSettings } from "./TextBlockSettings";

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

function seedSectionState({
  sectionId,
  sectionName,
  variantId,
  implId,
  impl,
}: {
  sectionId: string;
  sectionName: string;
  variantId: string;
  implId: string;
  impl: Record<string, unknown>;
}) {
  const projectConfig = createProjectConfig({
    id: "project-1",
    sectionVariantMap: { [sectionId]: variantId },
    topLevelSections: {
      [sectionId]: { x: 0, y: 0, zIndex: 0, w: null, h: null },
    },
  });
  const sectionCore = createCore({
    id: sectionId,
    name: sectionName,
    variants: [variantId],
    defaultVariant: variantId,
  });
  const sectionVariant = createVariant({
    id: variantId,
    name: "Variant",
    impl: implId,
    nonPresetImpls: [],
  });
  useProjectState.setState((state) => {
    state.projectConfig = projectConfig;
    state.sections = { [sectionId]: sectionCore };
    state.sectionVariants = { [variantId]: sectionVariant };
    state.sectionImpls = { [implId]: impl };
    state.parentSectionMap = { [sectionId]: null };
    state.previewSectionVariantMap = {};
    state.shownParamIds = {
      [variantId]: {
        pinned: [],
        unpinned: [],
      },
    };
  });
  syncStoreInitialState(useProjectState);
}

describe("Section data-authoring settings", () => {
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
    syncStoreInitialState(useShareSession);
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("renders text block master font-size control", () => {
    const sectionId = "textblock-section";
    const implId = "textblock-impl";
    seedSectionState({
      sectionId,
      sectionName: "TextBlock",
      variantId: "textblock-variant",
      implId,
      impl: createTextBlockSectionImpl(createUserDefaultTextBlockSectionImpl(), {
        id: implId,
        masterFontSizePx: 19,
      }),
    });

    const markup = renderToStaticMarkup(<TextBlockSettings sectionId={sectionId} />);
    expect(markup).toContain("Master Font Size");
    expect(markup).toContain('type="range"');
    expect(markup).toContain("19px");
  });

  it("renders child-default dropdown and filters disallowed section kinds", () => {
    const sectionId = "listroot-section";
    const implId = "listroot-impl";
    seedSectionState({
      sectionId,
      sectionName: "ListRoot",
      variantId: "listroot-variant",
      implId,
      impl: createListRootSectionImpl(createUserDefaultListRootSectionImpl(), {
        id: implId,
        defaultChildSectionType: SectionTypeEnum.Dict,
      }),
    });

    const markup = renderToStaticMarkup(
      <ChildDefaultsSettings sectionId={sectionId} />,
    );
    expect(markup).toContain("Default Child Section");
    expect(markup).toContain(
      "Incrementer-created children will use this section type by default.",
    );
    expect(markup).toContain('option value="Dict"');
    expect(markup).not.toContain('option value="GlobalVariables"');
    expect(markup).not.toContain('option value="GenPythonCode"');
    expect(markup).not.toContain('option value="GenPythonMetadata"');
  });

  it("renders callable string-args toggle in section config", () => {
    const sectionId = "callable-section";
    const implId = "callable-impl";
    seedSectionState({
      sectionId,
      sectionName: "Callable",
      variantId: "callable-variant",
      implId,
      impl: createCallableSectionImpl(createUserDefaultCallableSectionImpl(), {
        id: implId,
        allowUnquotedStringArgs: true,
      }),
    });

    const markup = renderToStaticMarkup(<EdgePortsSettings sectionId={sectionId} />);
    expect(markup).toContain("String Args");
    expect(markup).toContain(
      "When enabled, string-typed code params accept unquoted values.",
    );
  });
});
