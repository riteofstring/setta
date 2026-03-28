import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SectionContainerAreaDictBoundary } from "./SectionContainerAreaDictBoundary";

let mockBenchmark = {
  active: false,
  renderFullSectionBody: true,
};

vi.mock("components/Pages/Project/settingsAllSettingsBenchmark", () => ({
  useSettingsAllSettingsBenchmark: () => mockBenchmark,
}));

vi.mock("../Layouts/SettingsAllSettingsBenchmarkDictArea", () => ({
  SettingsAllSettingsBenchmarkDictArea: ({
    sectionId,
    bgColor,
  }: {
    sectionId: string;
    bgColor: string;
  }) => (
    <div
      data-testid="mock-benchmark-dict-area"
      data-section-id={sectionId}
      data-bg-color={bgColor}
    />
  ),
}));

vi.mock("./SectionContainerDictArea", () => ({
  SectionContainerDictArea: ({
    sectionId,
    bgColor,
  }: {
    sectionId: string;
    bgColor: string;
  }) => (
    <div
      data-testid="mock-section-container-dict-area"
      data-section-id={sectionId}
      data-bg-color={bgColor}
    />
  ),
}));

describe("SectionContainerAreaDictBoundary", () => {
  beforeEach(() => {
    mockBenchmark = {
      active: false,
      renderFullSectionBody: true,
    };
  });

  it("keeps the live dict renderer handoff in the dedicated dict boundary when benchmarking is inactive", () => {
    const markup = renderToStaticMarkup(
      <SectionContainerAreaDictBoundary
        sectionId="section-1"
        bgColor="bg-setta-50"
      />,
    );

    expect(markup).toContain('data-testid="mock-section-container-dict-area"');
    expect(markup).toContain('data-section-id="section-1"');
    expect(markup).toContain('data-bg-color="bg-setta-50"');
    expect(markup).not.toContain('data-testid="mock-benchmark-dict-area"');
  });

  it("switches the dedicated dict boundary to the benchmark shell when the full body is disabled", () => {
    mockBenchmark = {
      active: true,
      renderFullSectionBody: false,
    };

    const markup = renderToStaticMarkup(
      <SectionContainerAreaDictBoundary
        sectionId="section-2"
        bgColor="bg-transparent"
      />,
    );

    expect(markup).toContain('data-testid="mock-benchmark-dict-area"');
    expect(markup).toContain('data-section-id="section-2"');
    expect(markup).toContain('data-bg-color="bg-transparent"');
    expect(markup).not.toContain(
      'data-testid="mock-section-container-dict-area"',
    );
  });
});
