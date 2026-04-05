import { SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  getSectionChromeStaticOutlineClassName,
  getSectionChromeStaticShellBorderClassName,
  getSectionChromeStaticTopDragHandleClassName,
  getSectionChromeSurfaceDomAdapter,
  getSectionChromeTitleDomAdapter,
  getSectionContainerShellClassName,
  getSectionSurfaceClassName,
  resolveSectionChromeFrameStructure,
  resolveSectionChromeShellDecorations,
  resolveSectionChromeSurfaceDecorations,
  resolveSectionChromeTitleDecorations,
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

  it("maps active and themed outline tones to shell-owned static outline classes", () => {
    expect(
      getSectionChromeStaticOutlineClassName({
        outlineTone: "active",
        hasSectionStyleTheme: false,
      }),
    ).toBe("outline-blue-600 dark:outline-blue-700");
    expect(
      getSectionChromeStaticOutlineClassName({
        outlineTone: "other-project-active",
        hasSectionStyleTheme: true,
      }),
    ).toBe("outline-[color:var(--setta-section-style-outline)]");
    expect(
      getSectionChromeStaticOutlineClassName({
        outlineTone: "inactive",
        hasSectionStyleTheme: false,
      }),
    ).toBe("outline-transparent");
  });

  it("maps shell border tones to shell-owned static border classes", () => {
    expect(
      getSectionChromeStaticShellBorderClassName({
        shellBorderTone: "default",
        hasSectionStyleTheme: false,
      }),
    ).toBe("border-white dark:border-setta-700");
    expect(
      getSectionChromeStaticShellBorderClassName({
        shellBorderTone: "locked",
        hasSectionStyleTheme: false,
      }),
    ).toBe("border-setta-400/90 dark:border-setta-800");
    expect(
      getSectionChromeStaticShellBorderClassName({
        shellBorderTone: "default",
        hasSectionStyleTheme: true,
      }),
    ).toBe("border-[color:var(--setta-section-style-border)]");
  });

  it("maps shell-owned top drag handle tones to renderer-neutral classes", () => {
    expect(
      getSectionChromeStaticTopDragHandleClassName({
        resizeHandleTone: "minimal",
        hasSectionStyleTheme: false,
      }),
    ).toBe("bg-setta-300/70 dark:bg-setta-600/70");
    expect(
      getSectionChromeStaticTopDragHandleClassName({
        resizeHandleTone: "default",
        hasSectionStyleTheme: true,
      }),
    ).toBe("bg-[color:var(--setta-section-style-border)] opacity-70");
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

  it("resolves renderer-neutral title decorations for uppercase fixed titles", () => {
    expect(
      resolveSectionChromeTitleDecorations({
        isActiveSection: true,
        isInOtherProjectConfigs: false,
        sectionTypeName: SectionTypeEnum.GlobalVariables,
        hasSectionStyleTheme: false,
      }),
    ).toEqual({
      useThemeTextColor: false,
      notEditingTone: "global-active",
      textCase: "uppercase",
      fixedStyle: "match-not-editing",
    });
  });

  it("maps title decorations to DOM classes without depending on SectionHeader helpers", () => {
    expect(
      getSectionChromeTitleDomAdapter({
        useThemeTextColor: false,
        notEditingTone: "terminal-inactive",
        textCase: "normal",
        fixedStyle: "subdued-italic",
      }),
    ).toEqual({
      editing:
        "cursor-text nodrag px-1 py-0 leading-5 -ml-1 bg-setta-100 focus-visible:ring-0 focus-visible:outline-none rounded-md box-border border border-solid border-transparent focus-visible:border-blue-500 dark:bg-setta-800 w-full dark:text-white font-bold text-[.7rem] tracking-tight",
      notEditing:
        "px-1 py-0 -ml-1 w-full focus-visible:ring-0 focus-visible:outline-none box-border rounded-md border border-solid border-transparent focus-visible:border-blue-500 leading-5 font-bold tracking-tight cursor-pointer max-w-full text-[.7rem] truncate text-setta-300",
      fixed:
        "select-none italic focus-visible:ring-0 focus-visible:outline-none box-border border border-solid border-transparent focus-visible:border-blue-500 tracking-tighter text-xs max-w-full truncate pr-0.5 text-setta-400",
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
