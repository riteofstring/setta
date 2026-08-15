import type { ComponentType, ReactNode } from "react";
import { PiTextTFill } from "react-icons/pi";
import {
  SiGnubash,
  SiJavascript,
  SiJson,
  SiMarkdown,
  SiPython,
  SiToml,
  SiTypescript,
  SiYaml,
} from "react-icons/si";
import { getSectionOrThrow } from "../document/documentSelectors";
import type {
  SectionKindDefinition,
  WorkspaceInspectorContributionContext,
} from "../document/sectionKindRegistry";
import { useWorkspaceDocument } from "../document/stores";
import type { SectionSize, WorkspaceSection } from "../document/types";
import { useSectionKindIconSectionId } from "../section/header/sectionKindIconContext";
import {
  parseWorkspaceCodeSectionData,
  WORKSPACE_CODE_SECTION_LANGUAGES,
  type WorkspaceCodeSectionLanguage,
} from "./codeSectionData";
import { WorkspaceCodeSectionBody } from "./WorkspaceCodeSectionBody";

// The public registration seam for the built-in Code Editor section. The helper returns an
// ordinary section-kind definition, so a host composes it with its own kinds in the single
// `registerSectionKinds` call it already makes and can leave it out entirely. Nothing here
// registers itself.

// The reference's `codeSectionDefault.size`.
const WORKSPACE_CODE_SECTION_DEFAULT_SIZE: SectionSize = { width: 500, height: "auto" };

// The reference's `codeLanguageIconComponents`.
const CODE_SECTION_LANGUAGE_ICONS: Record<
  WorkspaceCodeSectionLanguage,
  ComponentType<{ className?: string }>
> = {
  python: SiPython,
  bash: SiGnubash,
  javascript: SiJavascript,
  typescript: SiTypescript,
  json: SiJson,
  yaml: SiYaml,
  toml: SiToml,
  markdown: SiMarkdown,
  plaintext: PiTextTFill,
};

export type WorkspaceCodeSectionRegistration = {
  // Replaces the language icon below with the host's own glyph.
  icon?: ComponentType<{ className?: string }>;
  // Applied when a loaded code section omits its size.
  defaultSize?: SectionSize;
  // Narrows the languages this registration accepts. A document naming a language outside the
  // list fails at load with the rest of the data contract.
  languages?: ReadonlyArray<WorkspaceCodeSectionLanguage>;
  renderInspector?: (context: WorkspaceInspectorContributionContext) => ReactNode;
};

function CodeSectionLanguageIcon({ className }: { className?: string }) {
  const sectionId = useSectionKindIconSectionId();
  const language = useWorkspaceDocument((state) => {
    const section = getSectionOrThrow(state, sectionId);
    return parseWorkspaceCodeSectionData(sectionId, section.data).language;
  });
  const Icon = CODE_SECTION_LANGUAGE_ICONS[language];
  return <Icon className={className} />;
}

function resolveAllowedLanguages(
  languages: ReadonlyArray<WorkspaceCodeSectionLanguage> | undefined,
): ReadonlyArray<WorkspaceCodeSectionLanguage> {
  if (languages === undefined) {
    return WORKSPACE_CODE_SECTION_LANGUAGES;
  }
  if (languages.length === 0) {
    throw new Error("A code section registration must allow at least one language.");
  }
  for (const language of languages) {
    if (!WORKSPACE_CODE_SECTION_LANGUAGES.includes(language)) {
      throw new Error(`A code section registration names the unknown language ${language}.`);
    }
  }
  return Object.freeze([...languages]);
}

export function createWorkspaceCodeSection(
  registration: WorkspaceCodeSectionRegistration = {},
): SectionKindDefinition {
  const allowedLanguages = resolveAllowedLanguages(registration.languages);
  return {
    renderContent: (section: WorkspaceSection) => (
      <WorkspaceCodeSectionBody allowedLanguages={allowedLanguages} section={section} />
    ),
    assertValidData: (section: WorkspaceSection) => {
      parseWorkspaceCodeSectionData(section.id, section.data, allowedLanguages);
    },
    icon: registration.icon ?? CodeSectionLanguageIcon,
    // The editor owns its own scroller, so the package body slot only has to give it the
    // section's remaining height.
    contentClassName: "flex min-h-0 flex-col",
    defaultSize: registration.defaultSize ?? WORKSPACE_CODE_SECTION_DEFAULT_SIZE,
    ...(registration.renderInspector === undefined
      ? {}
      : { renderInspector: registration.renderInspector }),
  };
}
