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
  WorkspaceSectionKindIconProps,
} from "../document/sectionKindRegistry";
import { useWorkspaceDocument } from "../document/stores";
import type { SectionSize, WorkspaceSection } from "../document/types";
import {
  parseWorkspaceCodeSectionData,
  WORKSPACE_CODE_SECTION_LANGUAGES,
  type WorkspaceCodeSectionLanguage,
} from "./codeSectionData";
import type { WorkspaceCodeSectionCompletionProvider } from "./codeSectionCompletion";
import { WorkspaceCodeSectionBody } from "./WorkspaceCodeSectionBody";

const WORKSPACE_CODE_SECTION_DEFAULT_SIZE: SectionSize = {
  width: 500,
  height: "auto",
};

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
  icon?: ComponentType<WorkspaceSectionKindIconProps>;

  defaultSize?: SectionSize;

  languages?: ReadonlyArray<WorkspaceCodeSectionLanguage>;
  renderInspector?: (
    context: WorkspaceInspectorContributionContext,
  ) => ReactNode;

  completionProvider?: WorkspaceCodeSectionCompletionProvider;
};

function CodeSectionLanguageIcon({
  className,
  sectionId,
}: WorkspaceSectionKindIconProps) {
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
    throw new Error(
      "A code section registration must allow at least one language.",
    );
  }
  for (const language of languages) {
    if (!WORKSPACE_CODE_SECTION_LANGUAGES.includes(language)) {
      throw new Error(
        `A code section registration names the unknown language ${language}.`,
      );
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
      <WorkspaceCodeSectionBody
        allowedLanguages={allowedLanguages}
        completionProvider={registration.completionProvider}
        section={section}
      />
    ),
    assertValidData: (section: WorkspaceSection) => {
      parseWorkspaceCodeSectionData(section.id, section.data, allowedLanguages);
    },
    icon: registration.icon ?? CodeSectionLanguageIcon,

    contentClassName: "flex min-h-0 flex-col",
    defaultSize:
      registration.defaultSize ?? WORKSPACE_CODE_SECTION_DEFAULT_SIZE,
    ...(registration.renderInspector === undefined
      ? {}
      : { renderInspector: registration.renderInspector }),
  };
}
