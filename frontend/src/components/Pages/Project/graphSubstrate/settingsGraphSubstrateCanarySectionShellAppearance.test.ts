import { SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { resolveSettingsGraphSubstrateCanarySectionShellAppearance } from "./settingsGraphSubstrateCanarySectionShellAppearance";

describe("resolveSettingsGraphSubstrateCanarySectionShellAppearance", () => {
  it("derives active code-section shell appearance for the static canary shell", () => {
    const appearance =
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
      });

    expect(appearance.hasSectionStyleTheme).toBe(true);
    expect(appearance.sectionStyleVars).toMatchObject({
      color: "#336699",
    });
    expect(appearance.frameStructure).toMatchObject({
      cornerStyle: "large",
      shellBorderTone: "default",
      shellBorderVisible: true,
      shellOutlineWidth: 4,
    });
    expect(appearance.shellDecorations.outlineTone).toBe("active");
    expect(appearance.surfaceDecorations).toMatchObject({
      layout: "section-grid",
      resizeHandleTone: "default",
      showTopDragHandle: false,
    });
  });

  it("keeps unlocked meta-control sections on the minimalist shell treatment", () => {
    const appearance =
      resolveSettingsGraphSubstrateCanarySectionShellAppearance({
        hasSectionStyleTheme: false,
        isActiveSection: false,
        isInOtherProjectConfigs: true,
        positionAndSizeLocked: false,
        sectionStyleVars: undefined,
        sectionTypeName: SectionTypeEnum.MetaControl,
        useMetaControlStyle: true,
      });

    expect(appearance.frameStructure).toMatchObject({
      shellBorderTone: "transparent",
      shellOutlineWidth: 2,
    });
    expect(appearance.shellDecorations.outlineTone).toBe(
      "other-project-inactive",
    );
    expect(appearance.surfaceDecorations).toMatchObject({
      frameTone: "transparent-hover",
      layout: "single-cell",
      resizeHandleTone: "minimal",
      showTopDragHandle: true,
    });
  });
});
