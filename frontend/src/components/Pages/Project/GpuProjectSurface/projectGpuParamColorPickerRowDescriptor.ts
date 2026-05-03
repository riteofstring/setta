import type {
  GpuRetainedContentColorChoice,
  GpuRetainedContentControlDescriptor,
} from "gpuFlow/retainedContentScene";
import type { ColorPickerParamCodeObjImpl } from "utils/generatedTypes";

export function createProjectGpuColorPickerControlDescriptor({
  codeObjImpl,
  controlKind,
}: {
  readonly codeObjImpl: ColorPickerParamCodeObjImpl;
  readonly controlKind: string;
}): GpuRetainedContentControlDescriptor {
  const choices = toProjectGpuColorPickerChoices(codeObjImpl);
  const displayValue = toProjectGpuColorPickerDisplayValue(codeObjImpl.value);
  const selectedIndex = choices.findIndex(
    (choice) => choice.color === displayValue,
  );
  return {
    choices,
    defaultDisplayValue: toProjectGpuColorPickerDisplayValue(
      codeObjImpl.defaultVal,
    ),
    displayValue,
    kind: "color-picker",
    rendererFamily: controlKind,
    commitPolicy: choices.length === 0 ? "native-island" : "immediate",
    selectedIndex: selectedIndex === -1 ? null : selectedIndex,
  };
}

function toProjectGpuColorPickerChoices(
  codeObjImpl: ColorPickerParamCodeObjImpl,
): readonly GpuRetainedContentColorChoice[] {
  const colorChoices = codeObjImpl.colorChoices ?? [];
  return colorChoices.map((choice, index) => {
    const color = choice.color;
    const description = choice.description;
    if (typeof color !== "string" || color.length === 0) {
      throw new Error(
        `Invalid GPU retained color choice ${index} for ${codeObjImpl.id}: expected a non-empty color string.`,
      );
    }
    if (typeof description !== "string") {
      throw new Error(
        `Invalid GPU retained color choice ${index} for ${codeObjImpl.id}: expected a description string.`,
      );
    }
    return { color, description };
  });
}

function toProjectGpuColorPickerDisplayValue(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}
