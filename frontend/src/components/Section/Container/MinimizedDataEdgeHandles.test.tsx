import { renderToStaticMarkup } from "react-dom/server";
import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
  SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER,
} from "utils/constants";
import {
  createCore,
  createDictSectionImpl,
  createProjectConfig,
  createVariant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MinimizedDataEdgeHandles } from "./MinimizedDataEdgeHandles";

function syncStoreInitialState(store: {
  getState: () => Record<string, unknown>;
  getInitialState?: () => Record<string, unknown>;
}): void {
  if (!store.getInitialState) {
    return;
  }
  const initialState = store.getInitialState();
  Object.assign(initialState, store.getState());
}

function seedMinimizedSection(): void {
  useProjectState.setState((state) => {
    state.projectConfig = createProjectConfig({
      id: "project-1",
      sectionVariantMap: {
        "section-a": "variant-a",
      },
    });
    state.sections = {
      "section-a": createCore({
        id: "section-a",
        name: "Minimized Dict",
        variants: ["variant-a"],
        defaultVariant: "variant-a",
      }),
    };
    state.sectionVariants = {
      "variant-a": createVariant({
        id: "variant-a",
        name: "Dict Variant",
        impl: "impl-a",
        nonPresetImpls: [],
      }),
    };
    state.sectionImpls = {
      "impl-a": createDictSectionImpl({
        id: "impl-a",
        edgeInputParams: ["input-a"],
        edgeOutputPorts: [{ id: "output-a", accessor: "result" }],
        isMinimized: true,
        name: "Minimized Dict",
      }),
    };
    state.previewSectionVariantMap = {};
  });
  syncStoreInitialState(useProjectState);
}

describe("MinimizedDataEdgeHandles", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("keeps minimized data handles out of pan, node-drag, and section activation ownership", () => {
    seedMinimizedSection();

    const markup = renderToStaticMarkup(
      <MinimizedDataEdgeHandles sectionId="section-a" />,
    );

    for (const handleClassName of [
      "arg-edge-handle--target",
      "arg-edge-handle--source",
    ]) {
      expect(markup).toMatch(
        new RegExp(
          `class="[^"]*${handleClassName}[^"]*${SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER}[^"]*${SETTA_PREVENT_SECTION_ACTIVE_CSS}[^"]*${NO_DRAG_CLASS_NAME}[^"]*${NO_PAN_CLASS_NAME}`,
        ),
      );
    }
  });
});
