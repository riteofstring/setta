import type { ColorValueChoice } from "../color/ColorValueControl";
import type {
  DateCalendarWeekStart,
  DateControlMode,
  DateDisplayFormat,
  DateSelectionMode,
  TimeControlMode,
  TimeDisplayFont,
  TimeDisplayFormat,
} from "../date-time/dateTimeTypes";
import type { DropdownValueChoiceGroup } from "../dropdown/DropdownValueControl";
import type {
  DropzoneAcceptedResult,
  DropzoneAttachment,
  DropzonePolicy,
  DropzoneRejection,
  DropzoneServerPickerRequest,
} from "../dropzone/dropzoneTypes";
import type { TextValueLanguage } from "../text/editorLanguages";

type ControlledMetaValue = {
  ariaLabel: string;
  value: string;
  onValueChange: (nextValue: string) => void;
  disabled?: boolean;
};

type IdentifiedControlledMetaValue = ControlledMetaValue & {
  controlId: string;
};

export type ButtonMetaControl = {
  kind: "button";
  label: string;
  onAction: () => void;
  disabled?: boolean;
  pending?: boolean;
};

export type TextMetaControl = IdentifiedControlledMetaValue & {
  kind: "text";
  placeholder?: string;
  language?: TextValueLanguage | null;
};

export type TextAreaMetaControl = IdentifiedControlledMetaValue & {
  kind: "textarea";
  placeholder?: string;
  language?: TextValueLanguage | null;
};

export type SliderMetaControl = ControlledMetaValue & {
  kind: "slider";
  min: number;
  max: number;
  step: number;
  onValueCommit?: (nextValue: string) => void;
};

export type RotaryMetaControl = ControlledMetaValue & {
  kind: "rotary";
  min: number;
  max: number;
  step: number;
};

export type SwitchMetaControl = ControlledMetaValue & {
  kind: "switch";
  label: string;
};

export type ColorMetaControl = IdentifiedControlledMetaValue & {
  kind: "color";
  choices?: Array<ColorValueChoice>;
};

export type DropdownMetaControl = ControlledMetaValue & {
  kind: "dropdown";
  choices: Array<string> | Array<DropdownValueChoiceGroup>;
  placeholder?: string;
};

export type PasswordMetaControl = IdentifiedControlledMetaValue & {
  kind: "password";
  placeholder?: string;
};

export type DateMetaControl = ControlledMetaValue & {
  kind: "date";
  displayFormat?: DateDisplayFormat;
  controlMode?: DateControlMode;
  selectionMode?: DateSelectionMode;
  weekStart?: DateCalendarWeekStart;
  includeTime?: boolean;
  timeDisplayFormat?: TimeDisplayFormat;
};

export type TimeMetaControl = ControlledMetaValue & {
  kind: "time";
  controlMode?: TimeControlMode;
  displayFormat?: TimeDisplayFormat;
  transparent?: boolean;
  scale?: number;
  font?: TimeDisplayFont;
};

export type DropzoneMetaControl = {
  kind: "dropzone";
  ariaLabel: string;
  controlId: string;
  attachments: ReadonlyArray<DropzoneAttachment>;
  policy: DropzonePolicy;
  onAccepted: (result: DropzoneAcceptedResult) => void;
  onRejected: (rejections: ReadonlyArray<DropzoneRejection>) => void;
  onServerFilePickerRequest?: (request: DropzoneServerPickerRequest) => void;
  onAttachmentRemove?: (attachmentId: string) => void;
  placeholder?: string;
  pending?: boolean;
  errorMessage?: string;
  disabled?: boolean;
};

export type MetaControlDefinition =
  | ButtonMetaControl
  | ColorMetaControl
  | DateMetaControl
  | DropdownMetaControl
  | DropzoneMetaControl
  | PasswordMetaControl
  | RotaryMetaControl
  | SliderMetaControl
  | SwitchMetaControl
  | TextAreaMetaControl
  | TextMetaControl
  | TimeMetaControl;
