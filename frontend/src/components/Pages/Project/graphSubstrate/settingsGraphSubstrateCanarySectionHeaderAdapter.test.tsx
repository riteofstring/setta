/* @vitest-environment jsdom */

import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { SectionTypeEnum } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolveSettingsGraphSubstrateCanarySectionHeader,
  SettingsGraphSubstrateCanarySectionHeaderDomAdapter,
} from "./settingsGraphSubstrateCanarySectionHeaderAdapter";

vi.mock("components/Section/Header/SectionWindowToggleButton", () => ({
  SectionWindowToggleButton: ({ sectionId }: { sectionId: string }) => (
    <button data-testid={`mock-window-toggle-${sectionId}`} type="button" />
  ),
}));

vi.mock("components/Section/Header/SectionHeader", () => ({
  SectionHeader: ({
    extraControls,
    hasSectionStyleTheme,
    isInOtherProjectConfigs,
    isRoot,
    isUserView,
    sectionId,
    sectionTypeName,
  }: {
    extraControls?: ReactNode;
    hasSectionStyleTheme: boolean;
    isInOtherProjectConfigs: boolean;
    isRoot: boolean;
    isUserView: boolean;
    sectionId: string;
    sectionTypeName: string;
  }) => (
    <div
      data-has-extra-controls={extraControls ? "true" : "false"}
      data-has-section-style-theme={hasSectionStyleTheme ? "true" : "false"}
      data-in-other-project-configs={isInOtherProjectConfigs ? "true" : "false"}
      data-is-root={isRoot ? "true" : "false"}
      data-is-user-view={isUserView ? "true" : "false"}
      data-section-id={sectionId}
      data-section-type={sectionTypeName}
      data-testid="mock-section-header"
    >
      {extraControls}
    </div>
  ),
}));

describe("SettingsGraphSubstrateCanarySectionHeaderAdapter", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    document.body.innerHTML = "";
  });

  it("resolves one renderer-facing header contract with the window toggle ownership decision", () => {
    expect(
      resolveSettingsGraphSubstrateCanarySectionHeader({
        hasSectionStyleTheme: true,
        isInOtherProjectConfigs: true,
        isRoot: false,
        isUserView: false,
        sectionId: "section-a",
        sectionTypeName: SectionTypeEnum.Code,
      }),
    ).toMatchObject({
      hasSectionStyleTheme: true,
      isInOtherProjectConfigs: true,
      isRoot: false,
      isUserView: false,
      sectionId: "section-a",
      sectionTypeName: SectionTypeEnum.Code,
      showWindowToggle: true,
    });
  });

  it("renders the DOM header adapter with the section window toggle when the header owns it", async () => {
    await act(async () => {
      root.render(
        <SettingsGraphSubstrateCanarySectionHeaderDomAdapter
          hasSectionStyleTheme={false}
          isInOtherProjectConfigs={false}
          isRoot={false}
          isUserView={false}
          sectionId="section-a"
          sectionTypeName={SectionTypeEnum.Code}
        />,
      );
    });

    const sectionHeader = host.querySelector<HTMLElement>(
      '[data-testid="mock-section-header"]',
    );
    expect(sectionHeader?.dataset.hasExtraControls).toBe("true");
    expect(sectionHeader?.dataset.sectionId).toBe("section-a");
    expect(sectionHeader?.dataset.sectionType).toBe(SectionTypeEnum.Code);
    expect(
      host.querySelector('[data-testid="mock-window-toggle-section-a"]'),
    ).not.toBeNull();
  });

  it("omits the section window toggle for user-view headers", async () => {
    await act(async () => {
      root.render(
        <SettingsGraphSubstrateCanarySectionHeaderDomAdapter
          hasSectionStyleTheme={false}
          isInOtherProjectConfigs={false}
          isRoot={false}
          isUserView={true}
          sectionId="section-b"
          sectionTypeName={SectionTypeEnum.Code}
        />,
      );
    });

    const sectionHeader = host.querySelector<HTMLElement>(
      '[data-testid="mock-section-header"]',
    );
    expect(sectionHeader?.dataset.hasExtraControls).toBe("false");
    expect(
      host.querySelector('[data-testid="mock-window-toggle-section-b"]'),
    ).toBeNull();
  });
});
