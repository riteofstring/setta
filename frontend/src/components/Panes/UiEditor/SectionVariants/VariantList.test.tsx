import { renderToStaticMarkup } from "react-dom/server";
import { useProjectState, useShareSession } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  createCodeSectionImpl,
  createCore,
  createProjectConfig,
  createUserDefaultCodeSectionImpl,
  createVariant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncStoreInitialState } from "../../paneTestUtils";
import { VariantList } from "./VariantList";

vi.mock("components/Pages/Project/ViewModeDnd", () => ({
  SortableListProvider: ({ children }: { children: unknown }) => children,
  useSortableListItem: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    setActivatorNodeRef: () => {},
    style: {},
    isDragging: false,
  }),
}));

function extractHandleClass(markup: string): string {
  const match = markup.match(
    /data-testid="section-variant-drag-handle"[^>]*class="([^"]*)"/,
  );
  if (!match) {
    throw new Error("Unable to locate variant drag handle in markup.");
  }
  return match[1] ?? "";
}

describe("VariantList drag handle visibility", () => {
  const sectionId = "section-1";
  const variantId = "variant-1";
  const implId = "impl-1";

  beforeEach(() => {
    resetProjectStores();
    useShareSession.setState({ isDeploymentMode: false, sharePolicy: null });
    useProjectState.setState((state) => {
      state.sections = {
        [sectionId]: createCore({
          id: sectionId,
          name: "blue_hill",
          variants: [variantId],
          defaultVariant: variantId,
        }),
      };
      state.projectConfig = createProjectConfig({
        id: "project-1",
        sectionVariantMap: { [sectionId]: variantId },
      });
      state.sectionVariants = {
        [variantId]: createVariant({
          id: variantId,
          name: "single_variant",
          impl: implId,
          nonPresetImpls: [implId],
        }),
      };
      state.sectionImpls = {
        [implId]: createCodeSectionImpl(createUserDefaultCodeSectionImpl(), {
          id: implId,
          name: "quiet_code",
        }),
      };
    });
    syncStoreInitialState(useShareSession);
    syncStoreInitialState(useProjectState);
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("keeps the left drag handle visible when there is only one version", () => {
    const markup = renderToStaticMarkup(<VariantList sectionId={sectionId} />);
    const handleClass = extractHandleClass(markup);

    // A single variant is not sortable, but the left handle should still remain visible.
    expect(handleClass).toContain("inline-flex");
    expect(handleClass).toContain("w-4");
    expect(handleClass).toContain("opacity-60");
    expect(handleClass).not.toContain("text-transparent");
  });
});
