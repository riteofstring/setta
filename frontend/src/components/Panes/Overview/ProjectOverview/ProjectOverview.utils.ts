import type { ColorPickerChoice } from "utils/generatedTypes";

export const TAG_FILTER_ALL = "__all__" as const;
export const TAG_FILTER_UNTAGGED = "__untagged__" as const;

export type TagFilterValue =
  | typeof TAG_FILTER_ALL
  | typeof TAG_FILTER_UNTAGGED
  | string;

type TagFilterDisplay = {
  dotColor: string;
  dotRingClassName: string;
  label: string;
};

const DEFAULT_TAG_FILTER_RING_CLASS_NAME = "ring-black/10 dark:ring-white/10";

const SPECIAL_TAG_FILTER_DISPLAYS = {
  [TAG_FILTER_ALL]: {
    dotColor: "transparent",
    dotRingClassName: "ring-setta-300/60 dark:ring-setta-700/60",
    label: "All",
  },
  [TAG_FILTER_UNTAGGED]: {
    dotColor: "rgba(148, 163, 184, 0.7)",
    dotRingClassName: DEFAULT_TAG_FILTER_RING_CLASS_NAME,
    label: "Untagged",
  },
} satisfies Record<
  typeof TAG_FILTER_ALL | typeof TAG_FILTER_UNTAGGED,
  TagFilterDisplay
>;

export function buildColorChoiceByColor(
  colorChoices: ColorPickerChoice[],
): Record<string, ColorPickerChoice> {
  const next: Record<string, ColorPickerChoice> = {};
  for (const choice of colorChoices) {
    next[choice.color] = choice;
  }
  return next;
}

export function getSelectedTagFilterDisplay(
  value: TagFilterValue,
  choiceByColor: Record<string, ColorPickerChoice>,
): TagFilterDisplay {
  const specialDisplay =
    SPECIAL_TAG_FILTER_DISPLAYS[
      value as typeof TAG_FILTER_ALL | typeof TAG_FILTER_UNTAGGED
    ];
  if (specialDisplay) {
    return specialDisplay;
  }
  const selectedChoice = choiceByColor[value];
  return {
    dotColor: selectedChoice?.color || value,
    dotRingClassName: DEFAULT_TAG_FILTER_RING_CLASS_NAME,
    label: selectedChoice?.description || value,
  };
}

export function getTagFilterOptionLabel(choice: ColorPickerChoice): string {
  return choice.description || choice.color;
}
