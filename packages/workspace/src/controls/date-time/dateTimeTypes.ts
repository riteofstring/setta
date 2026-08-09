export type DateCalendarWeekStart = "sunday" | "monday";
export type DateControlMode = "input" | "calendar";
export type DateDisplayFormat = "iso" | "us" | "eu" | "long";
export type DateSelectionMode = "single" | "multiple";
export type TimeControlMode = "input" | "display";
export type TimeDisplayFont = "clock" | "monospace" | "system";
export type TimeDisplayFormat = "twenty_four_hour" | "twelve_hour";

export type DateValueControlProps = {
  ariaLabel: string;
  sectionId: string;
  value: string;
  onValueChange: (nextValue: string) => void;
  displayFormat?: DateDisplayFormat;
  controlMode?: DateControlMode;
  selectionMode?: DateSelectionMode;
  weekStart?: DateCalendarWeekStart;
  includeTime?: boolean;
  timeDisplayFormat?: TimeDisplayFormat;
  disabled?: boolean;
};

export type TimeValueControlProps = {
  ariaLabel: string;
  sectionId: string;
  value: string;
  onValueChange: (nextValue: string) => void;
  controlMode?: TimeControlMode;
  displayFormat?: TimeDisplayFormat;
  transparent?: boolean;
  scale?: number;
  font?: TimeDisplayFont;
  disabled?: boolean;
};
