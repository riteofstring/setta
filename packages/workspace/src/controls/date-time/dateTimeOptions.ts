export const DATE_OPTIONS = {
  displayFormat: ["iso", "us", "eu", "long"],
  controlMode: ["input", "calendar"],
  selectionMode: ["single", "multiple"],
  weekStart: ["sunday", "monday"],
} as const;

export const TIME_DISPLAY_FORMATS = [
  "twenty_four_hour",
  "twelve_hour",
] as const;

export const TIME_OPTIONS = {
  controlMode: ["input", "display"],
  displayFormat: TIME_DISPLAY_FORMATS,
  font: ["clock", "monospace", "system"],
} as const;

export const TIME_DISPLAY_SCALE_MIN = 0.5;
export const TIME_DISPLAY_SCALE_MAX = 3;
