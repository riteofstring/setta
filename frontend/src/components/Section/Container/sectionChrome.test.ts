import { describe, expect, it } from "vitest";
import {
  getSectionContainerShellClassName,
  getSectionSurfaceClassName,
  resolveSectionChromeFrameStructure,
  resolveSectionChromeShellDecorations,
} from "./sectionChrome";

describe("sectionChrome", () => {
  it("resolves renderer-neutral shell decorations for active global write-highlighted sections", () => {
    expect(
      resolveSectionChromeShellDecorations({
        isActiveSection: true,
        isGlobalVariables: true,
        isInOtherProjectConfigs: false,
        showAiHighlight: true,
        isReadScope: false,
        isWriteScope: true,
      }),
    ).toEqual({
      outlineTone: "global-active",
      scopeHighlight: "write",
      showAiHighlight: true,
      zIndexClassName: "z-[150]",
    });
  });

  it("resolves inactive other-project shell decorations without elevation", () => {
    expect(
      resolveSectionChromeShellDecorations({
        isActiveSection: false,
        isGlobalVariables: false,
        isInOtherProjectConfigs: true,
        showAiHighlight: false,
        isReadScope: true,
        isWriteScope: false,
      }),
    ).toEqual({
      outlineTone: "other-project-inactive",
      scopeHighlight: "read",
      showAiHighlight: false,
      zIndexClassName: "z-10",
    });
  });

  it("resolves renderer-neutral frame structure for locked joined shells", () => {
    expect(
      resolveSectionChromeFrameStructure({
        positionAndSizeLocked: true,
        useMetaControlStyle: false,
        joinedCorners: "code-terminal-parent",
        isJoinedAttachedTerminalChild: false,
        hideBorder: false,
        hideFrameBorder: false,
      }),
    ).toEqual({
      cornerStyle: "small",
      joinedEdge: "bottom",
      shellBorderTone: "locked",
      shellBorderVisible: true,
      shellOutlineWidth: 4,
      surfaceFrameVisible: true,
    });
  });

  it("drops shell outlines and uses transparent borders for meta-control chrome", () => {
    expect(
      resolveSectionChromeFrameStructure({
        positionAndSizeLocked: false,
        useMetaControlStyle: true,
        joinedCorners: "none",
        isJoinedAttachedTerminalChild: true,
        hideBorder: true,
        hideFrameBorder: true,
      }),
    ).toEqual({
      cornerStyle: "large",
      joinedEdge: "top",
      shellBorderTone: "transparent",
      shellBorderVisible: false,
      shellOutlineWidth: 0,
      surfaceFrameVisible: false,
    });
  });

  it("supports full-bleed section shells without borders or outlines", () => {
    const className = getSectionContainerShellClassName({
      outlineTone: "inactive",
      scopeHighlight: "none",
      showAiHighlight: false,
      useMetaControlStyle: false,
      hasSectionStyleTheme: false,
      positionAndSizeLocked: false,
      forceHideOutline: true,
      hideBorder: true,
      sizeClassName: "h-full w-full",
      cornerClassName: "rounded-none",
    });

    expect(className).toContain("border-0");
    expect(className).toContain("outline-0");
    expect(className).toContain("rounded-none");
  });

  it("maps shell decorations to DOM classes without reparsing section state", () => {
    const className = getSectionContainerShellClassName({
      outlineTone: "other-project-active",
      scopeHighlight: "write",
      showAiHighlight: true,
      useMetaControlStyle: false,
      hasSectionStyleTheme: false,
      positionAndSizeLocked: false,
    });

    expect(className).toContain("outline-purple-600");
    expect(className).toContain("ring-amber-400/70");
    expect(className).toContain("setta-ai-gradient-border-active");
  });

  it("supports full-bleed section surfaces without frame borders", () => {
    const className = getSectionSurfaceClassName({
      bgColor: "bg-white",
      hasSectionStyleTheme: false,
      positionAndSizeLocked: false,
      hideFrameBorder: true,
      cornerClassName: "rounded-none",
    });

    expect(className).toContain("before:border-0");
    expect(className).toContain("rounded-none");
  });
});
