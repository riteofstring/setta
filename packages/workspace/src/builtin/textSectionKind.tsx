import type { ComponentType, ReactNode } from "react";
import { FaMarkdown } from "react-icons/fa6";
import { PiTextTFill } from "react-icons/pi";
import { getSectionOrThrow } from "../document/documentSelectors.js";
import type {
  SectionKindDefinition,
  WorkspaceInspectorContributionContext,
  WorkspaceSectionKindIconProps,
} from "../document/sectionKindRegistry.js";
import { useWorkspaceDocument } from "../document/stores.js";
import type { SectionSize, WorkspaceSection } from "../document/types.js";
import {
  parseWorkspaceTextSectionData,
  WORKSPACE_TEXT_SECTION_DISPLAY_MODES,
  WORKSPACE_TEXT_SECTION_FORMATS,
  type WorkspaceTextSectionChoices,
  type WorkspaceTextSectionDisplayMode,
  type WorkspaceTextSectionFormat,
} from "./textSectionData.js";
import { ToggleTextSectionDisplayModeButton } from "./ToggleTextSectionDisplayModeButton.js";
import { WorkspaceTextSectionBody } from "./WorkspaceTextSectionBody.js";

const WORKSPACE_TEXT_SECTION_DEFAULT_SIZE: SectionSize = {
  width: 500,
  height: 150,
};

const TEXT_SECTION_FORMAT_ICONS: Record<
  WorkspaceTextSectionFormat,
  ComponentType<{ className?: string }>
> = {
  markdown: FaMarkdown,
  plaintext: PiTextTFill,
};

export type WorkspaceTextSectionRegistration = {
  icon?: ComponentType<WorkspaceSectionKindIconProps>;

  defaultSize?: SectionSize;

  formats?: ReadonlyArray<WorkspaceTextSectionFormat>;

  displayModes?: ReadonlyArray<WorkspaceTextSectionDisplayMode>;

  showDisplayModeControl?: boolean;
  renderInspector?: (
    context: WorkspaceInspectorContributionContext,
  ) => ReactNode;
};

function TextSectionFormatIcon({
  className,
  sectionId,
}: WorkspaceSectionKindIconProps) {
  const format = useWorkspaceDocument((state) => {
    const section = getSectionOrThrow(state, sectionId);
    return parseWorkspaceTextSectionData(sectionId, section.data).format;
  });
  const Icon = TEXT_SECTION_FORMAT_ICONS[format];
  return <Icon className={className} />;
}

function resolveChoices<Choice extends string>(
  choices: ReadonlyArray<Choice> | undefined,
  supported: ReadonlyArray<Choice>,
  role: string,
): ReadonlyArray<Choice> {
  if (choices === undefined) {
    return supported;
  }
  if (choices.length === 0) {
    throw new Error(
      `A text section registration must allow at least one ${role}.`,
    );
  }
  for (const choice of choices) {
    if (!supported.includes(choice)) {
      throw new Error(
        `A text section registration names the unknown ${role} ${choice}.`,
      );
    }
  }
  return Object.freeze([...choices]);
}

export function createWorkspaceTextSection(
  registration: WorkspaceTextSectionRegistration = {},
): SectionKindDefinition {
  const choices: WorkspaceTextSectionChoices = {
    formats: resolveChoices(
      registration.formats,
      WORKSPACE_TEXT_SECTION_FORMATS,
      "format",
    ),
    displayModes: resolveChoices(
      registration.displayModes,
      WORKSPACE_TEXT_SECTION_DISPLAY_MODES,
      "display mode",
    ),
  };
  const showDisplayModeControl =
    (registration.showDisplayModeControl ?? true) &&
    choices.displayModes.length > 1;

  return {
    renderContent: (section: WorkspaceSection) => (
      <WorkspaceTextSectionBody choices={choices} section={section} />
    ),
    assertValidData: (section: WorkspaceSection) => {
      parseWorkspaceTextSectionData(section.id, section.data, choices);
    },
    icon: registration.icon ?? TextSectionFormatIcon,

    contentClassName: "flex min-h-0 flex-col",
    defaultSize:
      registration.defaultSize ?? WORKSPACE_TEXT_SECTION_DEFAULT_SIZE,
    ...(showDisplayModeControl
      ? {
          renderHeaderControls: (section: WorkspaceSection) => (
            <ToggleTextSectionDisplayModeButton
              choices={choices}
              section={section}
            />
          ),
        }
      : {}),
    ...(registration.renderInspector === undefined
      ? {}
      : { renderInspector: registration.renderInspector }),
  };
}
