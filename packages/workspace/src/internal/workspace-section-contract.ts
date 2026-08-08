import type { ComponentType, ReactNode } from "react";

import type {
  SectionChrome,
  SectionDimensionMode,
  SectionOrientation,
  SectionOverflow,
  WorkspaceJsonValue,
} from "../core.js";

export type SectionResizeAxes = "both" | "horizontal" | "none" | "vertical";

export type SectionDefaultSize = Readonly<{
  height: number;
  width: number;
}>;

export type SectionDefaultSizeMode = Readonly<{
  height: SectionDimensionMode;
  width: SectionDimensionMode;
}>;

export type SectionContentSizing = Readonly<{
  height: boolean;
  width: boolean;
}>;

export type SectionResizeOptions = Readonly<{
  axes: SectionResizeAxes;
  maxSize?: Partial<SectionDefaultSize>;
  minSize?: Partial<SectionDefaultSize>;
  preserveAspectRatio?: boolean;
}>;

export type SectionCreationMetadata = Readonly<{
  group?: string;
  icon?: ReactNode;
  keywords?: readonly string[];
}>;

export type SectionRenderProps<TSectionData = WorkspaceJsonValue> = Readonly<{
  appearance: "dark" | "light";
  data: TSectionData;
  readOnly: boolean;
  sectionId: string;
}>;

export type SectionDefinition<TSectionData = WorkspaceJsonValue> = Readonly<{
  canContainSections?: boolean;
  chrome?: SectionChrome;
  contentSizing?: SectionContentSizing;
  creation?: SectionCreationMetadata;
  defaultChildOrientation?: SectionOrientation;
  defaultChildOverflow?: SectionOverflow;
  defaultSize: SectionDefaultSize;
  defaultSizeMode?: SectionDefaultSizeMode;
  defaultTitle?: string;
  displayName: string;
  kind: string;
  minimizable?: boolean;
  render: ComponentType<SectionRenderProps<TSectionData>>;
  resize?: SectionResizeOptions;
}>;
