/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { SectionTypeEnum } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolveSettingsGraphSubstrateCanarySectionBody,
  resolveSettingsGraphSubstrateCanarySectionBodySurface,
  SettingsGraphSubstrateCanarySectionBodyDomAdapter,
} from "./settingsGraphSubstrateCanarySectionBodyAdapter";
import { SettingsGraphSubstrateCanarySectionHeaderDomAdapter } from "./settingsGraphSubstrateCanarySectionHeaderAdapter";

const { mockSectionContainer } = vi.hoisted(() => ({
  mockSectionContainer: vi.fn(
    ({
      bodySurfaceOverride,
      sectionId,
      forceHideOutline,
      forceHideFrameBorder,
      forceTransparentBorder,
      forceTransparentBackground,
      forceHideTopDragHandle,
      headerRenderer,
      isTopLevel,
      shellChromeOwner,
    }: {
      bodySurfaceOverride?: {
        bgColor: string;
        surfaceDecorations: {
          layout: string;
          showTopDragHandle: boolean;
        };
      };
      forceHideOutline?: boolean;
      forceHideFrameBorder?: boolean;
      forceTransparentBackground?: boolean;
      forceHideTopDragHandle?: boolean;
      forceTransparentBorder?: boolean;
      headerRenderer?: unknown;
      isTopLevel?: boolean;
      shellChromeOwner?: string;
      sectionId: string;
    }) => (
      <div
        data-force-hide-outline={forceHideOutline ? "true" : "false"}
        data-force-hide-frame-border={forceHideFrameBorder ? "true" : "false"}
        data-force-hide-top-drag-handle={
          forceHideTopDragHandle ? "true" : "false"
        }
        data-force-transparent-border={
          forceTransparentBorder ? "true" : "false"
        }
        data-force-transparent-background={
          forceTransparentBackground ? "true" : "false"
        }
        data-is-top-level={isTopLevel ? "true" : "false"}
        data-shell-chrome-owner={shellChromeOwner ?? ""}
        data-surface-bg-color={bodySurfaceOverride?.bgColor ?? ""}
        data-surface-layout={
          bodySurfaceOverride?.surfaceDecorations.layout ?? ""
        }
        data-surface-show-top-drag-handle={
          bodySurfaceOverride?.surfaceDecorations.showTopDragHandle
            ? "true"
            : "false"
        }
        data-header-renderer={headerRenderer ? "true" : "false"}
        data-testid={`section-body-${sectionId}`}
      />
    ),
  ),
}));

vi.mock("components/Section/Container/sectionChromeAppearance", () => ({
  useSectionChromeAppearance: ({
    sectionTypeName,
    textBlockMetaControlStyle,
  }: {
    sectionTypeName: string;
    textBlockMetaControlStyle: boolean;
  }) => ({
    backgroundColor:
      sectionTypeName === "MetaControl" || textBlockMetaControlStyle
        ? null
        : "#f4f7fb",
    bgColor:
      sectionTypeName === "MetaControl" || textBlockMetaControlStyle
        ? "bg-transparent"
        : "bg-setta-50",
    hasSectionStyleTheme: false,
    sectionStyleVars: undefined,
    useMetaControlStyle:
      sectionTypeName === "MetaControl" || textBlockMetaControlStyle,
  }),
}));

vi.mock("components/Section/Container/SectionContainer", () => ({
  SectionContainer: mockSectionContainer,
}));

describe("SettingsGraphSubstrateCanarySectionBodyAdapter", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mockSectionContainer.mockClear();
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

  it("suppresses duplicate DOM shell chrome when the shell layer owns the shell visuals", async () => {
    const sectionBody = resolveSettingsGraphSubstrateCanarySectionBody({
      positionAndSizeLocked: false,
      sectionId: "section-a",
      sectionTypeName: SectionTypeEnum.Code,
      shellChromeOwner: "shell-layer",
      styleColor: null,
      textBlockMetaControlStyle: false,
    });

    await act(async () => {
      root.render(
        <SettingsGraphSubstrateCanarySectionBodyDomAdapter
          sectionBody={sectionBody}
        />,
      );
    });

    expect(mockSectionContainer).toHaveBeenCalledTimes(1);
    expect(mockSectionContainer.mock.calls[0]?.[0]).toMatchObject({
      bodySurfaceOverride: {
        bgColor: "bg-transparent",
        surfaceDecorations: {
          layout: "section-grid",
          showTopDragHandle: false,
        },
      },
      forceHideOutline: true,
      forceHideFrameBorder: true,
      forceHideTopDragHandle: true,
      forceTransparentBackground: true,
      forceTransparentBorder: true,
      isTopLevel: true,
      headerRenderer: SettingsGraphSubstrateCanarySectionHeaderDomAdapter,
      shellChromeOwner: "shell-layer",
      sectionId: "section-a",
    });
  });

  it("keeps the DOM body chrome enabled when the section body owns the shell chrome", async () => {
    const sectionBody = resolveSettingsGraphSubstrateCanarySectionBody({
      positionAndSizeLocked: false,
      sectionId: "section-b",
      sectionTypeName: SectionTypeEnum.Code,
      shellChromeOwner: "section-body",
      styleColor: null,
      textBlockMetaControlStyle: false,
    });

    await act(async () => {
      root.render(
        <SettingsGraphSubstrateCanarySectionBodyDomAdapter
          sectionBody={sectionBody}
        />,
      );
    });

    expect(mockSectionContainer.mock.calls[0]?.[0]).toMatchObject({
      isTopLevel: true,
      shellChromeOwner: "section-body",
      sectionId: "section-b",
    });
    expect(mockSectionContainer.mock.calls[0]?.[0]).not.toHaveProperty(
      "forceHideOutline",
    );
    expect(mockSectionContainer.mock.calls[0]?.[0]).not.toHaveProperty(
      "forceHideFrameBorder",
    );
    expect(mockSectionContainer.mock.calls[0]?.[0]).toMatchObject({
      forceTransparentBackground: false,
    });
    expect(mockSectionContainer.mock.calls[0]?.[0]).not.toHaveProperty(
      "forceHideTopDragHandle",
    );
    expect(mockSectionContainer.mock.calls[0]?.[0]).not.toHaveProperty(
      "forceTransparentBorder",
    );
  });

  it("resolves the body surface contract from the shared chrome surface rules", () => {
    expect(
      resolveSettingsGraphSubstrateCanarySectionBodySurface({
        bgColor: "bg-canary-surface",
        positionAndSizeLocked: false,
        sectionTypeName: SectionTypeEnum.MetaControl,
        useMetaControlStyle: true,
      }),
    ).toMatchObject({
      bgColor: "bg-canary-surface",
      surfaceDecorations: {
        frameTone: "transparent-hover",
        hoverElevation: "raise-on-hover",
        layout: "single-cell",
        resizeHandleTone: "minimal",
        showTopDragHandle: true,
      },
    });
  });
});
