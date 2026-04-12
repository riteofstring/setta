import { SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { resolveSettingsGraphSubstrateCanarySectionShellAppearance } from "./settingsGraphSubstrateCanarySectionShellAppearance";
import { resolveSettingsGraphSubstrateCanarySectionShellLayer } from "./settingsGraphSubstrateCanarySectionShellLayer";

describe("resolveSettingsGraphSubstrateCanarySectionShellLayer", () => {
  it("derives the bordered active code shell layer from shared shell appearance", () => {
    const shellLayer = resolveSettingsGraphSubstrateCanarySectionShellLayer(
      resolveSettingsGraphSubstrateCanarySectionShellAppearance({
        hasSectionStyleTheme: true,
        isActiveSection: true,
        isInOtherProjectConfigs: false,
        positionAndSizeLocked: false,
        sectionStyleVars: {
          color: "#336699",
        },
        sectionTypeName: SectionTypeEnum.Code,
        useMetaControlStyle: false,
      }),
    );

    expect(shellLayer.sectionStyleVars).toMatchObject({
      color: "#336699",
    });
    expect(shellLayer.border).toMatchObject({
      shellBorderTone: "default",
    });
    expect(shellLayer.border?.className).toContain("rounded-lg");
    expect(shellLayer.border?.className).toContain(
      "border-[color:var(--setta-section-style-border)]",
    );
    expect(shellLayer.outline).toMatchObject({
      outlineTone: "active",
    });
    expect(shellLayer.outline?.className).toContain("outline-4");
    expect(shellLayer.outline?.className).toContain(
      "outline-[color:var(--setta-section-style-outline)]",
    );
    expect(shellLayer.topDragHandle).toBeNull();
  });

  it("derives the minimalist meta-control shell layer without a static border", () => {
    const shellLayer = resolveSettingsGraphSubstrateCanarySectionShellLayer(
      resolveSettingsGraphSubstrateCanarySectionShellAppearance({
        hasSectionStyleTheme: false,
        isActiveSection: false,
        isInOtherProjectConfigs: true,
        positionAndSizeLocked: false,
        sectionStyleVars: undefined,
        sectionTypeName: SectionTypeEnum.MetaControl,
        useMetaControlStyle: true,
      }),
    );

    expect(shellLayer.sectionStyleVars).toBeUndefined();
    expect(shellLayer.border).toBeNull();
    expect(shellLayer.outline).toMatchObject({
      outlineTone: "other-project-inactive",
    });
    expect(shellLayer.outline?.className).toContain("outline-2");
    expect(shellLayer.outline?.className).toContain("outline-transparent");
    expect(shellLayer.topDragHandle).toMatchObject({
      resizeHandleTone: "minimal",
    });
    expect(shellLayer.topDragHandle?.innerClassName).toContain(
      "bg-setta-300/70",
    );
  });
});
