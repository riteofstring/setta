import { describe, expect, it } from "vitest";
import {
  getSectionContainerShellClassName,
  getSectionSurfaceClassName,
} from "./sectionChrome.js";

const SHELL_BASE =
  "group/card-section transition-radius relative dndline outline w-min border";
const SURFACE_BASE =
  "relative grid h-full transition-radius before:content-none before:block before:absolute before:top-0 before:right-0 before:bottom-0 before:left-0";
const INACTIVE_OUTLINE =
  "outline-transparent [&:active:not(:has(button:active,:active.setta-prevent-section-active-css))]:outline-cyan-300";
const INACTIVE_THEMED_OUTLINE =
  "outline-transparent [&:active:not(:has(button:active,:active.setta-prevent-section-active-css))]:outline-[color:var(--setta-section-style-outline)]";
const THEMED_SHELL_CHROME =
  "!border-[color:var(--setta-section-style-border)] !bg-[color:var(--setta-section-style-bg)]";

describe("getSectionContainerShellClassName", () => {
  it("renders the idle unlocked shell", () => {
    expect(
      getSectionContainerShellClassName({
        isActiveSection: false,
        hasSectionStyleTheme: false,
        positionAndSizeLocked: false,
      }),
    ).toBe(
      `${SHELL_BASE} border-white dark:border-setta-700 rounded-lg bg-white dark:bg-setta-925 outline-4 ${INACTIVE_OUTLINE}`,
    );
  });

  it("selects with an outline only, leaving border, radius, and size classes unchanged", () => {
    expect(
      getSectionContainerShellClassName({
        isActiveSection: true,
        hasSectionStyleTheme: false,
        positionAndSizeLocked: false,
      }),
    ).toBe(
      `${SHELL_BASE} border-white dark:border-setta-700 rounded-lg bg-white dark:bg-setta-925 outline-4 outline-blue-600 dark:outline-blue-700`,
    );
  });

  it("renders the locked shell with the tighter radius and locked border", () => {
    expect(
      getSectionContainerShellClassName({
        isActiveSection: false,
        hasSectionStyleTheme: false,
        positionAndSizeLocked: true,
      }),
    ).toBe(
      `${SHELL_BASE} border-setta-400/90 dark:border-setta-800 rounded-sm bg-white dark:bg-setta-925 outline-4 ${INACTIVE_OUTLINE}`,
    );
  });

  it("routes themed shells through the section-style CSS variables", () => {
    expect(
      getSectionContainerShellClassName({
        isActiveSection: false,
        hasSectionStyleTheme: true,
        positionAndSizeLocked: false,
      }),
    ).toBe(
      `${SHELL_BASE} border-white dark:border-setta-700 rounded-lg bg-white dark:bg-setta-925 outline-4 ${INACTIVE_THEMED_OUTLINE} ${THEMED_SHELL_CHROME}`,
    );
  });

  it("uses the themed outline variable when a themed shell is selected", () => {
    expect(
      getSectionContainerShellClassName({
        isActiveSection: true,
        hasSectionStyleTheme: true,
        positionAndSizeLocked: false,
      }),
    ).toBe(
      `${SHELL_BASE} border-white dark:border-setta-700 rounded-lg bg-white dark:bg-setta-925 outline-4 outline-[color:var(--setta-section-style-outline)] ${THEMED_SHELL_CHROME}`,
    );
  });

  it("renders the transparent headerless meta-control shell", () => {
    expect(
      getSectionContainerShellClassName({
        isActiveSection: false,
        hasSectionStyleTheme: false,
        positionAndSizeLocked: false,
        useMetaControlStyle: true,
      }),
    ).toBe(
      `${SHELL_BASE} border-white dark:border-setta-700 rounded-lg bg-transparent dark:bg-transparent !border-transparent dark:!border-transparent outline-2 outline-transparent group-hover/card-section:outline-setta-400/60 dark:group-hover/card-section:outline-setta-700/60`,
    );
  });
});

describe("getSectionSurfaceClassName", () => {
  it("renders the default surface with the section grid and frame overlay", () => {
    expect(
      getSectionSurfaceClassName({
        bgColor: "bg-setta-50 dark:bg-setta-860",
        hasSectionStyleTheme: false,
        positionAndSizeLocked: false,
      }),
    ).toBe(
      `bg-setta-50 dark:bg-setta-860 section-grid-cols section-grid-rows section-grid-areas ${SURFACE_BASE} before:border rounded-lg z-10 before:border-white dark:before:border-setta-700`,
    );
  });

  it("suppresses pointer events without touching geometry classes", () => {
    expect(
      getSectionSurfaceClassName({
        bgColor: "bg-setta-50 dark:bg-setta-860",
        hasSectionStyleTheme: false,
        positionAndSizeLocked: false,
        shouldDisablePointerEvents: true,
      }),
    ).toBe(
      `pointer-events-none select-none bg-setta-50 dark:bg-setta-860 section-grid-cols section-grid-rows section-grid-areas ${SURFACE_BASE} before:border rounded-lg z-10 before:border-white dark:before:border-setta-700`,
    );
  });

  it("renders the locked themed surface with variable-driven frame colors", () => {
    expect(
      getSectionSurfaceClassName({
        bgColor: "bg-setta-50 dark:bg-setta-860",
        hasSectionStyleTheme: true,
        positionAndSizeLocked: true,
      }),
    ).toBe(
      `bg-setta-50 dark:bg-setta-860 section-grid-cols section-grid-rows section-grid-areas ${SURFACE_BASE} before:border rounded-sm z-10 before:border-white dark:before:border-setta-700 !bg-[color:var(--setta-section-style-bg)] before:!border-[color:var(--setta-section-style-border)]`,
    );
  });

  it("renders the single-cell transparent meta-control surface and hover frame", () => {
    expect(
      getSectionSurfaceClassName({
        bgColor: "bg-transparent",
        hasSectionStyleTheme: false,
        positionAndSizeLocked: false,
        layoutClassName: "grid-cols-1 grid-rows-1",
        metaHoverZIndexClassName: "group-hover/card-section:z-[170]",
        frameClassName:
          "before:!border-transparent dark:before:!border-transparent group-hover/card-section:before:!border-setta-400/60 dark:group-hover/card-section:before:!border-setta-700/60",
      }),
    ).toBe(
      `bg-transparent grid-cols-1 grid-rows-1 ${SURFACE_BASE} before:border rounded-lg z-10 group-hover/card-section:z-[170] before:!border-transparent dark:before:!border-transparent group-hover/card-section:before:!border-setta-400/60 dark:group-hover/card-section:before:!border-setta-700/60`,
    );
  });
});
