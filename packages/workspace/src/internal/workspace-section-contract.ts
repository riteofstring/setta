import type { ComponentType, ReactNode } from "react";

import type {
  SectionChrome,
  SectionDimensionMode,
  SectionOrientation,
  SectionOverflow,
  WorkspaceJsonValue,
} from "../core.js";
import { isValidWorkspaceColor } from "../core.js";
import { isDenseArray, optionOverridesAt } from "./runtime-option-validation.js";

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

export type WorkspaceSectionColorOption = Readonly<{
  color: string;
  label: string;
}>;

export type WorkspaceSectionTitleValidationRequest = Readonly<{
  currentTitle: string;
  sectionId: string;
  title: string;
}>;

export type WorkspaceSectionTitleValidator = (
  request: WorkspaceSectionTitleValidationRequest,
) => Promise<string | null> | string | null;

export const WORKSPACE_DEFAULT_SECTION_COLOR_PALETTE: readonly WorkspaceSectionColorOption[] =
  Object.freeze([
    Object.freeze({ color: "oklch(0.62 0.14 255)", label: "Blue" }),
    Object.freeze({ color: "oklch(0.64 0.1 195)", label: "Teal" }),
    Object.freeze({ color: "oklch(0.64 0.11 145)", label: "Green" }),
    Object.freeze({ color: "oklch(0.72 0.11 80)", label: "Amber" }),
    Object.freeze({ color: "oklch(0.64 0.14 35)", label: "Coral" }),
    Object.freeze({ color: "oklch(0.62 0.13 305)", label: "Violet" }),
  ]);

const sectionColorOptionKeys = ["color", "label"] as const;

function resolveSectionColorOption(value: unknown, index: number): WorkspaceSectionColorOption {
  const label = `Workspace section color option at index ${String(index)}`;
  const record = optionOverridesAt(
    value,
    sectionColorOptionKeys,
    label,
    "workspace section color option field",
  );
  if (typeof record.label !== "string" || record.label.trim().length === 0) {
    throw new TypeError(`${label} label must be a non-empty string.`);
  }
  if (typeof record.color !== "string" || !isValidWorkspaceColor(record.color)) {
    throw new TypeError(`${label} color must be a valid CSS color.`);
  }
  return Object.freeze({ color: record.color, label: record.label.trim() });
}

export function resolveWorkspaceSectionColorPalette(
  palette: readonly WorkspaceSectionColorOption[] | undefined,
): readonly WorkspaceSectionColorOption[] {
  if (palette === undefined) {
    return WORKSPACE_DEFAULT_SECTION_COLOR_PALETTE;
  }
  if (!isDenseArray(palette)) {
    throw new TypeError(
      "Workspace section color palette must be a dense array without extra fields.",
    );
  }
  const resolved = palette.map(resolveSectionColorOption);
  const labels = new Set(resolved.map(({ label }) => label.toLocaleLowerCase()));
  const colors = new Set(resolved.map(({ color }) => color.toLocaleLowerCase()));
  if (labels.size !== resolved.length) {
    throw new TypeError("Workspace section color palette labels must be unique.");
  }
  if (colors.size !== resolved.length) {
    throw new TypeError("Workspace section color palette colors must be unique.");
  }
  return Object.freeze(resolved);
}

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
