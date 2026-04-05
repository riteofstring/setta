/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolveSettingsGraphSubstrateCanarySectionBody,
  SettingsGraphSubstrateCanarySectionBodyDomAdapter,
} from "./settingsGraphSubstrateCanarySectionBodyAdapter";

const { mockSectionContainer } = vi.hoisted(() => ({
  mockSectionContainer: vi.fn(
    ({
      sectionId,
      forceHideOutline,
      forceTransparentBorder,
      forceHideTopDragHandle,
      isTopLevel,
    }: {
      forceHideOutline?: boolean;
      forceHideTopDragHandle?: boolean;
      forceTransparentBorder?: boolean;
      isTopLevel?: boolean;
      sectionId: string;
    }) => (
      <div
        data-force-hide-outline={forceHideOutline ? "true" : "false"}
        data-force-hide-top-drag-handle={
          forceHideTopDragHandle ? "true" : "false"
        }
        data-force-transparent-border={
          forceTransparentBorder ? "true" : "false"
        }
        data-is-top-level={isTopLevel ? "true" : "false"}
        data-testid={`section-body-${sectionId}`}
      />
    ),
  ),
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
      sectionId: "section-a",
      shellChromeOwner: "shell-layer",
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
      forceHideOutline: true,
      forceHideTopDragHandle: true,
      forceTransparentBorder: true,
      isTopLevel: true,
      sectionId: "section-a",
    });
  });

  it("keeps the DOM body chrome enabled when the section body owns the shell chrome", async () => {
    const sectionBody = resolveSettingsGraphSubstrateCanarySectionBody({
      sectionId: "section-b",
      shellChromeOwner: "section-body",
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
      sectionId: "section-b",
    });
    expect(mockSectionContainer.mock.calls[0]?.[0]).not.toHaveProperty(
      "forceHideOutline",
    );
    expect(mockSectionContainer.mock.calls[0]?.[0]).not.toHaveProperty(
      "forceHideTopDragHandle",
    );
    expect(mockSectionContainer.mock.calls[0]?.[0]).not.toHaveProperty(
      "forceTransparentBorder",
    );
  });
});
