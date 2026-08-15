import type { ComponentType, ReactNode } from "react";
import { FaMarkdown } from "react-icons/fa6";
import { PiTextTFill } from "react-icons/pi";
import { getSectionOrThrow } from "../document/documentSelectors";
import type {
  SectionKindDefinition,
  WorkspaceInspectorContributionContext,
} from "../document/sectionKindRegistry";
import { useWorkspaceDocument } from "../document/stores";
import type { SectionSize, WorkspaceSection } from "../document/types";
import { useSectionKindIconSectionId } from "../section/header/sectionKindIconContext";
import {
  parseWorkspaceTextSectionData,
  WORKSPACE_TEXT_SECTION_DISPLAY_MODES,
  WORKSPACE_TEXT_SECTION_FORMATS,
  type WorkspaceTextSectionChoices,
  type WorkspaceTextSectionDisplayMode,
  type WorkspaceTextSectionFormat,
} from "./textSectionData";
import { ToggleTextSectionDisplayModeButton } from "./ToggleTextSectionDisplayModeButton";
import { WorkspaceTextSectionBody } from "./WorkspaceTextSectionBody";

// The public registration seam for the built-in Text section. The helper returns an ordinary
// section-kind definition, so a host composes it with its own kinds in the single
// `registerSectionKinds` call it already makes and can leave it out entirely. Nothing here
// registers itself.

// The reference's `createTextBlockSectionImpl` default size.
const WORKSPACE_TEXT_SECTION_DEFAULT_SIZE: SectionSize = { width: 500, height: 150 };

// The reference's `TextBlockIcon`.
const TEXT_SECTION_FORMAT_ICONS: Record<
  WorkspaceTextSectionFormat,
  ComponentType<{ className?: string }>
> = {
  markdown: FaMarkdown,
  plaintext: PiTextTFill,
};

export type WorkspaceTextSectionRegistration = {
  // Replaces the format icon below with the host's own glyph.
  icon?: ComponentType<{ className?: string }>;
  // Applied when a loaded text section omits its size.
  defaultSize?: SectionSize;
  // Narrows the formats this registration accepts. A document naming a format outside the list
  // fails at load with the rest of the data contract.
  formats?: ReadonlyArray<WorkspaceTextSectionFormat>;
  // Narrows the display modes the same way. A single-mode list forces that mode and leaves the
  // header control out, because there is nothing left for it to toggle.
  displayModes?: ReadonlyArray<WorkspaceTextSectionDisplayMode>;
  // Leaves the header control out while both modes stay authorable, for a host that drives the
  // mode from its own UI. Defaults to showing it.
  showDisplayModeControl?: boolean;
  renderInspector?: (context: WorkspaceInspectorContributionContext) => ReactNode;
};

function TextSectionFormatIcon({ className }: { className?: string }) {
  const sectionId = useSectionKindIconSectionId();
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
    throw new Error(`A text section registration must allow at least one ${role}.`);
  }
  for (const choice of choices) {
    if (!supported.includes(choice)) {
      throw new Error(`A text section registration names the unknown ${role} ${choice}.`);
    }
  }
  return Object.freeze([...choices]);
}

export function createWorkspaceTextSection(
  registration: WorkspaceTextSectionRegistration = {},
): SectionKindDefinition {
  const choices: WorkspaceTextSectionChoices = {
    formats: resolveChoices(registration.formats, WORKSPACE_TEXT_SECTION_FORMATS, "format"),
    displayModes: resolveChoices(
      registration.displayModes,
      WORKSPACE_TEXT_SECTION_DISPLAY_MODES,
      "display mode",
    ),
  };
  const showDisplayModeControl =
    (registration.showDisplayModeControl ?? true) && choices.displayModes.length > 1;

  return {
    renderContent: (section: WorkspaceSection) => (
      <WorkspaceTextSectionBody choices={choices} section={section} />
    ),
    assertValidData: (section: WorkspaceSection) => {
      parseWorkspaceTextSectionData(section.id, section.data, choices);
    },
    icon: registration.icon ?? TextSectionFormatIcon,
    // Both surfaces own their own scroller, so the package body slot only has to give them the
    // section's remaining height.
    contentClassName: "flex min-h-0 flex-col",
    defaultSize: registration.defaultSize ?? WORKSPACE_TEXT_SECTION_DEFAULT_SIZE,
    ...(showDisplayModeControl
      ? {
          renderHeaderControls: (section: WorkspaceSection) => (
            <ToggleTextSectionDisplayModeButton choices={choices} section={section} />
          ),
        }
      : {}),
    ...(registration.renderInspector === undefined
      ? {}
      : { renderInspector: registration.renderInspector }),
  };
}
