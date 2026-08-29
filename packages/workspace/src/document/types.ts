import type { CSSProperties } from "react";

export type Position = {
  x: number;
  y: number;
};

export type Viewport = {
  x: number;
  y: number;
  zoom: number;
};

export type SectionSizeValue = number | "auto";

export type SectionSize = {
  width: SectionSizeValue;
  height: SectionSizeValue;
};

export type TopLevelSectionLayout = {
  x: number;
  y: number;
  w: number | null;
  h: number | null;
  zIndex: number;
};

export type WorkspaceSectionData =
  | string
  | number
  | boolean
  | null
  | Array<WorkspaceSectionData>
  | { [key: string]: WorkspaceSectionData };

export type WorkspaceItemTextLanguage =
  | "python"
  | "typescript"
  | "javascript"
  | "json"
  | "yaml"
  | "toml"
  | "markdown";

export type WorkspaceItemAutocompletePolicy = "off";

export type WorkspaceItemControlBaseConfiguration = {
  disabled: boolean;
};

export type WorkspaceTextItemControlConfiguration =
  WorkspaceItemControlBaseConfiguration & {
    autocomplete: WorkspaceItemAutocompletePolicy;
    placeholder: string | null;
    singleLine: boolean;
    wrapLines: boolean;
  };

export type WorkspaceCodeItemControlConfiguration =
  WorkspaceTextItemControlConfiguration & {
    language: WorkspaceItemTextLanguage;
  };

export type WorkspaceTextAreaItemControlConfiguration =
  WorkspaceItemControlBaseConfiguration & {
    autocomplete: WorkspaceItemAutocompletePolicy;
    language: WorkspaceItemTextLanguage | null;
    placeholder: string | null;
  };

export type WorkspaceSwitchItemControlConfiguration =
  WorkspaceItemControlBaseConfiguration;

export type WorkspaceDropdownChoiceGroup = {
  group: string;
  choices: Array<string>;
};

export type WorkspaceDropdownItemControlConfiguration =
  WorkspaceItemControlBaseConfiguration & {
    choices: Array<string> | Array<WorkspaceDropdownChoiceGroup>;
    placeholder: string | null;
  };

export type WorkspaceColorChoice = {
  color: string;
  description: string;
};

export type WorkspaceColorItemControlConfiguration =
  WorkspaceItemControlBaseConfiguration & {
    choices: Array<WorkspaceColorChoice> | null;
  };

export type WorkspaceNumericItemControlConfiguration =
  WorkspaceItemControlBaseConfiguration & {
    min: number;
    max: number;
    step: number;
  };

export type WorkspacePasswordItemControlConfiguration =
  WorkspaceItemControlBaseConfiguration & {
    placeholder: string | null;
    savedValuePending: boolean;
  };

export type WorkspaceDateItemControlConfiguration =
  WorkspaceItemControlBaseConfiguration & {
    displayFormat: "iso" | "us" | "eu" | "long";
    controlMode: "input" | "calendar";
    selectionMode: "single" | "multiple";
    weekStart: "sunday" | "monday";
    includeTime: boolean;
    timeDisplayFormat: "twenty_four_hour" | "twelve_hour";
  };

export type WorkspaceTimeItemControlConfiguration =
  WorkspaceItemControlBaseConfiguration & {
    controlMode: "input" | "display";
    displayFormat: "twenty_four_hour" | "twelve_hour";
    transparent: boolean;
    scale: number;
    font: "clock" | "monospace" | "system";
  };

export type WorkspaceDropzoneAttachment = {
  id: string;
  kind: "file" | "text";
  name: string;
  size: number | null;
};

export type WorkspaceDropzonePolicy = {
  maxAttachments: number | null;
  maxFileBytes: number;
  maxTotalBytes: number | null;
  allowedMimePrefixes: Array<string>;
};

export type WorkspaceDropzoneItemControlConfiguration =
  WorkspaceItemControlBaseConfiguration & {
    attachments: Array<WorkspaceDropzoneAttachment>;
    policy: WorkspaceDropzonePolicy;
    placeholder: string;
    pending: boolean;
    errorMessage: string | null;
  };

type WorkspaceValueItemControl<Kind extends string, Configuration> = {
  kind: Kind;
  value: string;
  configuration: Configuration;
};

export type WorkspaceItemControlPresentation =
  | { kind: "group" }
  | WorkspaceValueItemControl<"text", WorkspaceTextItemControlConfiguration>
  | WorkspaceValueItemControl<"code", WorkspaceCodeItemControlConfiguration>
  | WorkspaceValueItemControl<
      "textarea",
      WorkspaceTextAreaItemControlConfiguration
    >
  | WorkspaceValueItemControl<"switch", WorkspaceSwitchItemControlConfiguration>
  | WorkspaceValueItemControl<
      "dropdown",
      WorkspaceDropdownItemControlConfiguration
    >
  | WorkspaceValueItemControl<"color", WorkspaceColorItemControlConfiguration>
  | WorkspaceValueItemControl<
      "slider",
      WorkspaceNumericItemControlConfiguration
    >
  | WorkspaceValueItemControl<
      "rotary",
      WorkspaceNumericItemControlConfiguration
    >
  | WorkspaceValueItemControl<
      "password",
      WorkspacePasswordItemControlConfiguration
    >
  | WorkspaceValueItemControl<"date", WorkspaceDateItemControlConfiguration>
  | WorkspaceValueItemControl<"time", WorkspaceTimeItemControlConfiguration>
  | WorkspaceValueItemControl<
      "dropzone",
      WorkspaceDropzoneItemControlConfiguration
    >;

export type WorkspaceItemControlKind = WorkspaceItemControlPresentation["kind"];

export type WorkspaceItemControlConfiguration =
  Exclude<
    WorkspaceItemControlPresentation,
    { kind: "group" }
  > extends infer Control
    ? Control extends { kind: infer Kind; configuration: infer Configuration }
      ? { kind: Kind; configuration: Configuration }
      : never
    : never;

export type WorkspaceItemPresentation = {
  label: string;

  labelEditable: boolean;

  helpText?: string;
  control: WorkspaceItemControlPresentation;
};

export type WorkspaceItem = {
  id: string;
  children: Array<string>;
  data?: WorkspaceSectionData;
  presentation?: WorkspaceItemPresentation;
};

export type WorkspaceSectionItemTree = {
  rootId: string;
  items: Record<string, WorkspaceItem>;
  selectedItemIds: Array<string>;

  itemColumnWidth?: number;
};

export type WorkspaceSection = {
  id: string;
  kind: string;
  name: string;
  size: SectionSize;

  overflowMode: boolean;
  isMinimized: boolean;
  positionAndSizeLocked: boolean;
  isHorizontalOrientation: boolean;
  styleColor: string | null;
  tagColor: string | null;
  children: Array<string>;
  data?: WorkspaceSectionData;

  itemTree?: WorkspaceSectionItemTree;
};

export type WorkspaceSectionInput = Omit<WorkspaceSection, "size"> & {
  size?: SectionSize;
};

export type WorkspaceDocument = {
  sections: Record<string, WorkspaceSection>;
  topLevelSections: Record<string, TopLevelSectionLayout>;

  viewport: Viewport | null;
  activeIds: Array<string>;
};

export type WorkspaceDocumentInput = Omit<WorkspaceDocument, "sections"> & {
  sections: Record<string, WorkspaceSectionInput>;
};

export type Node = {
  id: string;
  position: Position;
  width: number | null;
  height: number | null;
  zIndex: number;
  tempZIndex: number;
  kind: string;
  style?: CSSProperties;
};
