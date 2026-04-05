import { describe, expect, it } from "vitest";
import {
  getSectionChromeSurfaceDomAdapter,
  getSectionContainerShellClassName,
  getSectionSurfaceClassName,
  resolveSectionChromeFrameStructure,
  resolveSectionChromeShellDecorations,
  resolveSectionChromeSurfaceDecorations,
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

  it("resolves renderer-neutral surface decorations for unlocked meta-control shells", () => {
    expect(
      resolveSectionChromeSurfaceDecorations({
        useMetaControlStyle: true,
        isMetaControlSection: true,
        isUserView: false,
        positionAndSizeLocked: false,
      }),
    ).toEqual({
      layout: "single-cell",
      frameTone: "transparent-hover",
      hoverElevation: "raise-on-hover",
      resizeHandleTone: "minimal",
      showTopDragHandle: true,
    });
  });

  it("keeps text-block meta-control surfaces on the default grid while reusing minimal handles", () => {
    expect(
      resolveSectionChromeSurfaceDecorations({
        useMetaControlStyle: true,
        isMetaControlSection: false,
        isUserView: false,
        positionAndSizeLocked: true,
      }),
    ).toEqual({
      layout: "section-grid",
      frameTone: "transparent-hover",
      hoverElevation: "raise-on-hover",
      resizeHandleTone: "minimal",
      showTopDragHandle: false,
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

  it("maps surface decorations to the DOM adapter props without re-deriving section state", () => {
    expect(
      getSectionChromeSurfaceDomAdapter({
        layout: "single-cell",
        frameTone: "transparent-hover",
        hoverElevation: "raise-on-hover",
        resizeHandleTone: "minimal",
        showTopDragHandle: true,
      }),
    ).toEqual({
      frameClassName:
        "before:!border-transparent dark:before:!border-transparent group-hover/card-section:before:!border-setta-400/60 dark:group-hover/card-section:before:!border-setta-700/60",
      layoutClassName: "grid-cols-1 grid-rows-1",
      metaHoverZIndexClassName: "group-hover/card-section:z-[170]",
    });
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
