import { BackgroundVariantEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { getProjectGpuGridInput } from "./gpuProjectGridInput";

const BASE_GRID_SETTINGS = {
  gridColor: "#112233",
  gridColorDarkMode: "#aabbccdd",
  gridPattern: BackgroundVariantEnum.dots,
  gridPatternSize: 3,
  showGridLines: true,
  snapGrid: [20, 30] as const,
};

describe("GpuProjectSurface grid input", () => {
  it("omits GPU grid input when project grid lines are hidden", () => {
    expect(
      getProjectGpuGridInput({
        darkMode: false,
        settings: {
          ...BASE_GRID_SETTINGS,
          showGridLines: false,
        },
      }),
    ).toBeUndefined();
  });

  it("passes light-mode grid settings into the GPU grid renderer", () => {
    expect(
      getProjectGpuGridInput({
        darkMode: false,
        settings: BASE_GRID_SETTINGS,
      }),
    ).toEqual({
      color: "#112233",
      patternSize: 3,
      snapGrid: [20, 30],
      variant: BackgroundVariantEnum.dots,
    });
  });

  it("passes dark-mode grid color without changing pattern geometry settings", () => {
    expect(
      getProjectGpuGridInput({
        darkMode: true,
        settings: {
          ...BASE_GRID_SETTINGS,
          gridPattern: BackgroundVariantEnum.lines,
        },
      }),
    ).toEqual({
      color: "#aabbccdd",
      patternSize: 3,
      snapGrid: [20, 30],
      variant: BackgroundVariantEnum.lines,
    });
  });
});
