/* @vitest-environment jsdom */

import {
  readSettingsGraphSubstrateCanaryInstrumentationSnapshot,
  resetSettingsGraphSubstrateCanaryInstrumentationSnapshot,
  updateSettingsGraphSubstrateCanaryInstrumentationSnapshot,
} from "components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation";
import { act, Profiler, type ProfilerOnRenderCallback } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DictArea } from "./DictArea";

vi.mock("../../Params/GroupContainer", () => ({
  ParamGroupContainer: ({
    bgColor,
    sectionId,
    sectionTypeName,
  }: {
    bgColor: string;
    sectionId: string;
    sectionTypeName: string;
  }) => (
    <div
      data-testid="mock-param-group-container"
      data-bg-color={bgColor}
      data-section-id={sectionId}
      data-section-type={sectionTypeName}
    />
  ),
}));

vi.mock("../SectionParts/KwargsControls", () => ({
  KwargsControls: ({ sectionId }: { sectionId: string }) => (
    <div data-testid="mock-kwargs-controls" data-section-id={sectionId} />
  ),
}));

type RenderedProfiledDictArea = {
  host: HTMLDivElement;
  root: Root;
};

async function renderProfiledDictArea(
  onRender: ProfilerOnRenderCallback,
): Promise<RenderedProfiledDictArea> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(
      <Profiler id="dict-area-profiler" onRender={onRender}>
        <DictArea sectionId="section-1" bgColor="bg-transparent" />
      </Profiler>,
    );
  });

  return { host, root };
}

describe("DictArea instrumentation", () => {
  afterEach(() => {
    resetSettingsGraphSubstrateCanaryInstrumentationSnapshot();
    document.body.innerHTML = "";
  });

  it("records kwargs and param-group profiler durations when canary attribution is active", async () => {
    updateSettingsGraphSubstrateCanaryInstrumentationSnapshot({
      motionAttributionActive: true,
    });
    const onRender = vi.fn<ProfilerOnRenderCallback>();

    const { host, root } = await renderProfiledDictArea(onRender);

    try {
      expect(onRender).toHaveBeenCalled();
      const motionAttribution =
        readSettingsGraphSubstrateCanaryInstrumentationSnapshot()
          .motionAttribution;
      expect(
        motionAttribution.presentedSceneSectionKwargsControlsReactRender.count,
      ).toBeGreaterThan(0);
      expect(
        motionAttribution.presentedSceneSectionParamGroupContainerReactRender
          .count,
      ).toBeGreaterThan(0);
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
