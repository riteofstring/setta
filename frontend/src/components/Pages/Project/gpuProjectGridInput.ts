import type { GpuGridInput } from "gpuFlow/gpuPipelines";

type ProjectGpuGridSettings = {
  readonly gridColor: string;
  readonly gridColorDarkMode: string;
  readonly gridPattern: GpuGridInput["variant"];
  readonly gridPatternSize: number;
  readonly showGridLines: boolean;
  readonly snapGrid: readonly [number, number];
};

export function getProjectGpuGridInput({
  darkMode,
  settings,
}: {
  readonly darkMode: boolean;
  readonly settings: ProjectGpuGridSettings;
}): GpuGridInput | undefined {
  if (!settings.showGridLines) {
    return undefined;
  }
  return {
    color: darkMode ? settings.gridColorDarkMode : settings.gridColor,
    patternSize: settings.gridPatternSize,
    snapGrid: settings.snapGrid,
    variant: settings.gridPattern,
  };
}
