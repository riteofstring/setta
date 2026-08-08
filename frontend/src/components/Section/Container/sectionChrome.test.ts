import { describe, expect, it } from "vitest";
import {
  getSectionContainerShellClassName,
  getSectionSurfaceClassName,
} from "./sectionChrome";

describe("sectionChrome", () => {
  it("supports full-bleed section shells without borders or outlines", () => {
    const className = getSectionContainerShellClassName({
      isActiveSection: false,
      isGlobalVariables: false,
      isInOtherProjectConfigs: false,
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

  it("applies themed meta-control shell classes for joined terminal sections", () => {
    const className = getSectionContainerShellClassName({
      isActiveSection: false,
      isGlobalVariables: false,
      isInOtherProjectConfigs: false,
      useMetaControlStyle: true,
      hasSectionStyleTheme: true,
      positionAndSizeLocked: true,
      joinedCorners: "code-terminal-parent",
      aiHighlightClassName: "ai-highlight",
    });

    expect(className).toContain("agentic-handle-scope");
    expect(className).toContain("agentic-handle-scope--themed");
    expect(className).toContain("rounded-b-none");
    expect(className).toContain("outline-2");
    expect(className).toContain(
      "group-hover/card-section:outline-setta-400/60",
    );
    expect(className).toContain(
      "!border-[color:var(--setta-section-style-border)]",
    );
    expect(className).toContain("ai-highlight");
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

  it("uses locked themed surface defaults when custom classes are omitted", () => {
    const className = getSectionSurfaceClassName({
      bgColor: "bg-neutral-50",
      hasSectionStyleTheme: true,
      positionAndSizeLocked: true,
      shouldDisablePointerEvents: true,
      isYouTube: true,
    });

    expect(className).toContain(
      "section-grid-cols section-grid-rows section-grid-areas",
    );
    expect(className).toContain("rounded-sm");
    expect(className).toContain("before:border");
    expect(className).toContain("pointer-events-none select-none");
    expect(className).toContain("overflow-clip");
    expect(className).toContain(
      "!bg-[color:var(--setta-section-style-bg)] before:!border-[color:var(--setta-section-style-border)]",
    );
  });
});
