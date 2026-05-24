/* @vitest-environment jsdom */

import { renderToStaticMarkup } from "react-dom/server";
import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  NO_WHEEL_CLASS_NAME,
} from "utils/constants";
import {
  SectionTypeEnum,
  createCore,
  createProjectConfig,
  createSectionSize,
  createVariant,
  type BaseSectionImplUnion,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SocialArea } from "./SocialArea";

vi.mock("react-tweet", async () => {
  const React = await import("react");
  return {
    Tweet: ({ id }: { id: string }) =>
      React.createElement("article", { "data-testid": "tweet" }, id),
  };
});

vi.mock("react-youtube", async () => {
  const React = await import("react");
  return {
    default: ({ videoId }: { videoId: string }) =>
      React.createElement("iframe", {
        "data-testid": "youtube-player",
        src: `https://www.youtube.com/embed/${videoId}`,
      }),
  };
});

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

function seedSocialSection(url: string) {
  const sectionId = "social-section";
  const variantId = "social-variant";
  const implId = "social-impl";
  const sectionImpl = {
    type: SectionTypeEnum.Social,
    id: implId,
    name: "Social",
    isFrozen: false,
    isInOtherProjectConfigs: false,
    tagColor: null,
    styleColor: null,
    size: createSectionSize({ width: 640, height: 382 }),
    aspectRatio: false,
    aspectRatioExtraHeight: 0,
    aspectRatioExtraWidth: 0,
    isMinimized: false,
    positionAndSizeLocked: false,
    isPreset: false,
    url,
  } as BaseSectionImplUnion;

  useProjectState.setState((state) => {
    state.projectConfig = createProjectConfig({
      id: "project-1",
      sectionVariantMap: { [sectionId]: variantId },
      topLevelSections: {
        [sectionId]: { x: 0, y: 0, zIndex: 0, w: null, h: null },
      },
    });
    state.sections = {
      [sectionId]: createCore({
        id: sectionId,
        name: "Social",
        variants: [variantId],
        defaultVariant: variantId,
      }),
    };
    state.sectionVariants = {
      [variantId]: createVariant({
        id: variantId,
        name: "Variant",
        impl: implId,
        nonPresetImpls: [],
      }),
    };
    state.sectionImpls = { [implId]: sectionImpl };
    state.parentSectionMap = { [sectionId]: null };
    state.previewSectionVariantMap = {};
  });
  syncStoreInitialState(useProjectState);

  return sectionId;
}

function renderSocialAreaMarkup(sectionId: string) {
  const markup = renderToStaticMarkup(<SocialArea sectionId={sectionId} />);
  const container = document.createElement("div");
  container.innerHTML = markup;
  return container;
}

function expectGpuGuardedElement(element: Element | null) {
  expect(element).not.toBeNull();
  expect(element?.getAttribute("data-gpu-flow-interactive")).toBe("true");
  expect(element?.classList.contains(NO_DRAG_CLASS_NAME)).toBe(true);
  expect(element?.classList.contains(NO_PAN_CLASS_NAME)).toBe(true);
}

function expectGpuWheelGuardedElement(element: Element | null) {
  expectGpuGuardedElement(element);
  expect(element?.classList.contains(NO_WHEEL_CLASS_NAME)).toBe(true);
  expect(element?.getAttribute("data-gpu-flow-wheel-target")).toBe("true");
}

describe("SocialArea GPU flow ownership", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("marks YouTube thumbnail surfaces as GPU flow interactive regions", () => {
    const sectionId = seedSocialSection(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
    const container = renderSocialAreaMarkup(sectionId);

    expectGpuWheelGuardedElement(
      container.querySelector(
        `[data-gpu-flow-control="social:youtube:${sectionId}"]`,
      ),
    );
    expectGpuGuardedElement(
      container.querySelector(
        `[data-gpu-flow-control="social:youtube-thumbnail:${sectionId}"]`,
      ),
    );
    expectGpuGuardedElement(
      container.querySelector(
        `[data-gpu-flow-control="social:youtube-thumbnail-image:${sectionId}"]`,
      ),
    );
  });

  it("marks Twitter embeds as GPU flow native wheel handoff regions", () => {
    const sectionId = seedSocialSection(
      "https://twitter.com/openai/status/1234567890",
    );
    const container = renderSocialAreaMarkup(sectionId);

    expectGpuWheelGuardedElement(
      container.querySelector(
        `[data-gpu-flow-control="social:twitter:${sectionId}"]`,
      ),
    );
  });
});
