/* @vitest-environment jsdom */

import { act, Profiler, type ProfilerOnRenderCallback } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import {
  createCore,
  createProjectConfig,
  createTextBlockSectionImpl,
  createUserDefaultTextBlockSectionImpl,
  createVariant,
  SectionTypeEnum,
  TextBlockDisplayModeEnum,
  TextBlockFormatEnum,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TextBlock } from "./TextBlock";

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

function seedTextBlockSection({
  format,
  text,
  masterFontSizePx,
}: {
  format: TextBlockFormatEnum;
  text: string;
  masterFontSizePx: number;
}) {
  const sectionId = "section-1";
  const variantId = "variant-1";
  const implId = "impl-1";
  const projectConfig = createProjectConfig({
    id: "project-1",
    sectionVariantMap: { [sectionId]: variantId },
    topLevelSections: {
      [sectionId]: { x: 0, y: 0, zIndex: 0, w: null, h: null },
    },
  });
  const sectionCore = createCore({
    id: sectionId,
    name: "TextBlock",
    variants: [variantId],
    defaultVariant: variantId,
  });
  const sectionVariant = createVariant({
    id: variantId,
    name: "Variant",
    impl: implId,
    nonPresetImpls: [],
  });
  const sectionImpl = createTextBlockSectionImpl(
    createUserDefaultTextBlockSectionImpl(),
    {
      id: implId,
      text,
      format,
      textDisplayMode: TextBlockDisplayModeEnum.Render,
      masterFontSizePx,
    },
  );

  useProjectState.setState((state) => {
    state.projectConfig = projectConfig;
    state.sections = { [sectionId]: sectionCore };
    state.sectionVariants = { [variantId]: sectionVariant };
    state.sectionImpls = { [implId]: sectionImpl };
    state.parentSectionMap = { [sectionId]: null };
    state.previewSectionVariantMap = {};
  });
  syncStoreInitialState(useProjectState);
  return sectionId;
}

describe("TextBlock typography scale", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "ResizeObserver", {
      configurable: true,
      writable: true,
      value: class ResizeObserverMock {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    });
  });

  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("applies markdown typography css vars derived from master size", () => {
    const sectionId = seedTextBlockSection({
      format: TextBlockFormatEnum.Markdown,
      text: "# Heading\n\nBody",
      masterFontSizePx: 18,
    });
    const markup = renderToStaticMarkup(<TextBlock sectionId={sectionId} />);

    expect(markup).toContain("--setta-textblock-body-size:18px");
    expect(markup).toContain("--setta-textblock-h1-size:36px");
    expect(markup).toContain(
      "prose-h1:text-[length:var(--setta-textblock-h1-size)]",
    );
  });

  it("applies plain text font-size from master size", () => {
    const sectionId = seedTextBlockSection({
      format: TextBlockFormatEnum.Plaintext,
      text: "plain output",
      masterFontSizePx: 22,
    });
    const markup = renderToStaticMarkup(<TextBlock sectionId={sectionId} />);

    expect(markup).toContain("<pre");
    expect(markup).toContain("font-size:22px");
  });
});

type RenderedProfiledTextBlock = {
  host: HTMLDivElement;
  root: Root;
};

async function renderProfiledTextBlock(
  sectionId: string,
  onRender: ProfilerOnRenderCallback,
): Promise<RenderedProfiledTextBlock> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(
      <Profiler id="text-block-profiler" onRender={onRender}>
        <TextBlock sectionId={sectionId} />
      </Profiler>,
    );
  });

  return { host, root };
}

describe("TextBlock store subscriptions", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "ResizeObserver", {
      configurable: true,
      writable: true,
      value: class ResizeObserverMock {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    });
    resetProjectStores();
  });

  afterEach(() => {
    resetProjectStores();
    document.body.innerHTML = "";
  });

  it("stays out of unrelated project-state commits when text-block inputs are unchanged", async () => {
    const sectionId = seedTextBlockSection({
      format: TextBlockFormatEnum.Markdown,
      text: "# Heading\n\nBody",
      masterFontSizePx: 18,
    });
    const onRender = vi.fn<ProfilerOnRenderCallback>();
    const { host, root } = await renderProfiledTextBlock(sectionId, onRender);

    try {
      const initialCommitCount = onRender.mock.calls.length;

      await act(async () => {
        // Unrelated preview-variant churn should not re-commit mounted text-block bodies.
        useProjectState.setState((state) => {
          state.previewSectionVariantMap = {
            otherSection: "other-variant",
          };
        });
      });

      expect(onRender).toHaveBeenCalledTimes(initialCommitCount);
      expect(host.innerHTML).toContain("Heading");
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("rerenders when the subscribed text changes", async () => {
    const sectionId = seedTextBlockSection({
      format: TextBlockFormatEnum.Markdown,
      text: "# Heading\n\nBody",
      masterFontSizePx: 18,
    });
    const onRender = vi.fn<ProfilerOnRenderCallback>();
    const { host, root } = await renderProfiledTextBlock(sectionId, onRender);

    try {
      const initialCommitCount = onRender.mock.calls.length;

      await act(async () => {
        // The mounted text-block body must still update when its own rendered text changes.
        useProjectState.setState((state) => {
          const impl = state.sectionImpls["impl-1"];
          if (impl.type !== SectionTypeEnum.TextBlock) {
            throw new Error("Expected TextBlock section impl.");
          }
          impl.text = "# Updated\n\nBody";
        });
      });

      expect(onRender.mock.calls.length).toBeGreaterThan(initialCommitCount);
      expect(host.innerHTML).toContain("Updated");
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
