/* @vitest-environment jsdom */

import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { SectionTypeEnum } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SettingsGraphSubstrateCanarySceneSection } from "./settingsGraphSubstrateCanarySceneSnapshot";
import {
  SettingsGraphSubstrateCanarySectionShell,
  type SettingsGraphSubstrateCanarySectionShellHandle,
} from "./settingsGraphSubstrateCanarySectionShell";

describe("SettingsGraphSubstrateCanarySectionShell", () => {
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

  it("updates shell placement and dragging attributes imperatively", async () => {
    const shellRef =
      createRef<SettingsGraphSubstrateCanarySectionShellHandle>();
    const handleSectionPointerDown = vi.fn();
    const handleSectionPointerMove = vi.fn();
    const finishSectionDrag = vi.fn();
    const onHoveredSectionChange = vi.fn();

    await act(async () => {
      root.render(
        <SettingsGraphSubstrateCanarySectionShell
          ref={shellRef}
          finishSectionDrag={finishSectionDrag}
          handleSectionPointerDown={handleSectionPointerDown}
          handleSectionPointerMove={handleSectionPointerMove}
          initialState={{
            isDragging: false,
            section: createSceneSection(),
          }}
          onHoveredSectionChange={onHoveredSectionChange}
        >
          <div data-testid="shell-child">child</div>
        </SettingsGraphSubstrateCanarySectionShell>,
      );
    });

    const shellElement = host.querySelector(
      '[data-testid="graph-substrate-canary-section"]',
    );
    expect(shellElement).not.toBeNull();
    expect(shellElement?.getAttribute("data-dragging")).toBe("false");
    expect(shellElement?.getAttribute("data-section-id")).toBe("section-a");
    expect(shellElement?.style.transform).toBe("translate(120px,80px)");
    expect(shellElement?.style.cursor).toBe("grab");

    act(() => {
      shellRef.current?.update({
        isDragging: true,
        section: createSceneSection({
          renderedPosition: { x: 180, y: 140 },
          tempZIndex: 1002,
        }),
      });
    });

    expect(shellElement?.getAttribute("data-dragging")).toBe("true");
    expect(shellElement?.style.transform).toBe("translate(180px,140px)");
    expect(shellElement?.style.cursor).toBe("grabbing");
    expect(shellElement?.style.zIndex).toBe("1002");
    expect(host.querySelector('[data-testid="shell-child"]')).not.toBeNull();
  });
});

function createSceneSection(
  overrides: Partial<SettingsGraphSubstrateCanarySceneSection> = {},
): SettingsGraphSubstrateCanarySceneSection {
  return {
    hasEmbeddedTerminal: false,
    height: 160,
    isActiveSection: false,
    isInOtherProjectConfigs: false,
    isMinimized: false,
    position: { x: 120, y: 80 },
    positionAndSizeLocked: false,
    renderedPosition: { x: 120, y: 80 },
    sceneBoundsSize: { height: 160, width: 240 },
    sectionId: "section-a",
    sectionTypeName: SectionTypeEnum.Code,
    sizeAuthority: "layout",
    styleColor: null,
    tempZIndex: 2,
    textBlockMetaControlStyle: false,
    width: 240,
    zIndex: 2,
    ...overrides,
  };
}
