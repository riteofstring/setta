/* @vitest-environment jsdom */

import { renderToStaticMarkup } from "react-dom/server";
import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import {
  createCore,
  createIFrameSectionImpl,
  createProjectConfig,
  createVariant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IframeArea } from "./IframeArea";

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

function seedIframeSection(code: string) {
  const sectionId = "iframe-section";
  const variantId = "iframe-variant";
  const implId = "iframe-impl";

  useProjectState.setState((state) => {
    state.projectConfig = createProjectConfig({
      id: "project-1",
      sectionVariantMap: { [sectionId]: variantId },
    });
    state.sections = {
      [sectionId]: createCore({
        id: sectionId,
        name: "IFrame",
        variants: [variantId],
        defaultVariant: variantId,
      }),
    };
    state.sectionVariants = {
      [variantId]: createVariant({
        id: variantId,
        impl: implId,
      }),
    };
    state.sectionImpls = {
      [implId]: createIFrameSectionImpl({
        id: implId,
        code,
      }),
    };
    state.previewSectionVariantMap = {};
  });
  syncStoreInitialState(useProjectState);

  return sectionId;
}

describe("IframeArea", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("renders persisted iframe HTML from the current section impl contract", () => {
    const sectionId = seedIframeSection(
      "<iframe src='https://example.com/embed' title='demo'></iframe>",
    );

    const markup = renderToStaticMarkup(<IframeArea sectionId={sectionId} />);

    expect(markup).toContain("section-main");
    expect(markup).toContain("nodrag");
    expect(markup).toContain("nopan");
    expect(markup).toContain("nowheel");
    expect(markup).toContain('data-gpu-flow-control="iframe:iframe-section"');
    expect(markup).toContain('data-gpu-flow-interactive="true"');
    expect(markup).toContain("https://example.com/embed");
    expect(markup).toContain("title='demo'");
  });

  it("suppresses non-iframe markup", () => {
    const sectionId = seedIframeSection("<div>not an iframe</div>");

    const markup = renderToStaticMarkup(<IframeArea sectionId={sectionId} />);

    expect(markup).toBe("");
  });
});
