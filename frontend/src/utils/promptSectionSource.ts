import type { Format, PromptSectionImpl, Template } from "utils/generatedTypes";

type ResolvedPromptSectionSource = {
  format: Format;
  isLinked: boolean;
  linkedTemplate: Template | null;
  linkedTemplateMissing: boolean;
  templateText: string;
};

type PromptLinkedTemplateNoticeVariant = "layout" | "settings";

type ResolvePromptLinkedTemplateNoticeParams = {
  promptTemplateId: string | null;
  promptTemplatesInitialLoadComplete: boolean;
  resolvedSource: ResolvedPromptSectionSource;
  variant: PromptLinkedTemplateNoticeVariant;
};

type ResolvePromptAreaUiStateParams = {
  canEditParams: boolean;
  isDeploymentMode: boolean;
  isFrozen: boolean;
  maxHeight: string | null;
  promptTemplateId: string | null;
  promptTemplatesInitialLoadComplete: boolean;
  renderError: string | null;
  resolvedSource: ResolvedPromptSectionSource;
  templateValue: string;
  viewMode: "template" | "preview";
};

type ResolvePromptSettingsUiStateParams = {
  canEditParams: boolean;
  isDeploymentMode: boolean;
  isFrozen: boolean;
  promptTemplateId: string | null;
  promptTemplatesInitialLoadComplete: boolean;
  resolvedSource: ResolvedPromptSectionSource;
};

const LINKED_TEMPLATE_MISSING_NOTICE = {
  layout:
    "This section is linked to a prompt template that could not be loaded. Choose a different prompt template in section settings.",
  settings:
    "This section is linked by id to a prompt template that could not be loaded. Choose a new template to repair the link.",
} satisfies Record<PromptLinkedTemplateNoticeVariant, string>;

const LINKED_TEMPLATE_PRESENT_NOTICE = {
  layout: (linkedTemplateName: string) =>
    `Linked to prompt template "${linkedTemplateName}". Edit it in Project AI Settings or make a local copy in section settings.`,
  settings: (linkedTemplateName: string) =>
    `This section is linked by id to prompt template "${linkedTemplateName}". Edit the template in Project AI Settings, or make a local copy to edit here.`,
} satisfies Record<
  PromptLinkedTemplateNoticeVariant,
  (linkedTemplateName: string) => string
>;

export function resolvePromptSectionSource(
  promptSection: Pick<
    PromptSectionImpl,
    "format" | "promptTemplateId" | "template"
  >,
  promptTemplates: Array<Template>,
): ResolvedPromptSectionSource {
  const promptTemplateId = promptSection.promptTemplateId ?? null;
  if (!promptTemplateId) {
    return {
      format: promptSection.format,
      isLinked: false,
      linkedTemplate: null,
      linkedTemplateMissing: false,
      templateText: promptSection.template,
    };
  }

  const linkedTemplate =
    promptTemplates.find((template) => template.id === promptTemplateId) ??
    null;
  if (!linkedTemplate) {
    return {
      format: promptSection.format,
      isLinked: true,
      linkedTemplate: null,
      linkedTemplateMissing: true,
      templateText: "",
    };
  }

  return {
    format: linkedTemplate.format,
    isLinked: true,
    linkedTemplate,
    linkedTemplateMissing: false,
    templateText: linkedTemplate.template,
  };
}

function resolvePromptLinkedTemplateNotice({
  promptTemplateId,
  promptTemplatesInitialLoadComplete,
  resolvedSource,
  variant,
}: ResolvePromptLinkedTemplateNoticeParams): string {
  if (!resolvedSource.isLinked) {
    return "";
  }
  if (
    resolvedSource.linkedTemplateMissing &&
    !promptTemplatesInitialLoadComplete
  ) {
    return "Loading linked prompt template...";
  }
  if (resolvedSource.linkedTemplateMissing) {
    return LINKED_TEMPLATE_MISSING_NOTICE[variant];
  }
  const linkedTemplateName =
    resolvedSource.linkedTemplate?.name || promptTemplateId || "";
  return LINKED_TEMPLATE_PRESENT_NOTICE[variant](linkedTemplateName);
}

export function resolvePromptAreaUiState({
  canEditParams,
  isDeploymentMode,
  isFrozen,
  maxHeight,
  promptTemplateId,
  promptTemplatesInitialLoadComplete,
  renderError,
  resolvedSource,
  templateValue,
  viewMode,
}: ResolvePromptAreaUiStateParams) {
  return {
    editorMaxHeight: resolvePromptAreaMaxHeight(viewMode, maxHeight),
    editorValue: resolvedSource.isLinked
      ? resolvedSource.templateText
      : templateValue,
    errorText: resolvePromptAreaErrorText(
      resolvedSource,
      promptTemplatesInitialLoadComplete,
      renderError,
    ),
    isReadOnly: isPromptAreaReadOnly(
      resolvedSource,
      isFrozen,
      isDeploymentMode,
      canEditParams,
    ),
    linkedTemplateInfo: resolvePromptLinkedTemplateNotice({
      promptTemplateId,
      promptTemplatesInitialLoadComplete,
      resolvedSource,
      variant: "layout",
    }),
  };
}

function resolvePromptAreaMaxHeight(
  viewMode: ResolvePromptAreaUiStateParams["viewMode"],
  maxHeight: string | null,
): string | null {
  if (viewMode !== "template" || !maxHeight) {
    return maxHeight;
  }
  return `calc(${maxHeight} - 32px)`;
}

function resolvePromptAreaErrorText(
  resolvedSource: ResolvedPromptSectionSource,
  promptTemplatesInitialLoadComplete: boolean,
  renderError: string | null,
): string {
  if (
    resolvedSource.linkedTemplateMissing &&
    promptTemplatesInitialLoadComplete
  ) {
    return "Linked prompt template could not be found.";
  }
  return renderError ?? "";
}

function isPromptAreaReadOnly(
  resolvedSource: ResolvedPromptSectionSource,
  isFrozen: boolean,
  isDeploymentMode: boolean,
  canEditParams: boolean,
): boolean {
  if (resolvedSource.isLinked || isFrozen) {
    return true;
  }
  return isDeploymentMode && !canEditParams;
}

export function resolvePromptSettingsUiState({
  canEditParams,
  isDeploymentMode,
  isFrozen,
  promptTemplateId,
  promptTemplatesInitialLoadComplete,
  resolvedSource,
}: ResolvePromptSettingsUiStateParams) {
  const canEdit = !isDeploymentMode || canEditParams;
  const isDisabled = isFrozen || !canEdit;
  const isLinked = resolvedSource.isLinked;
  return {
    isDisabled,
    linkedTemplateDescription: resolvedSource.linkedTemplate?.description ?? "",
    linkedTemplateInfo: resolvePromptLinkedTemplateNotice({
      promptTemplateId,
      promptTemplatesInitialLoadComplete,
      resolvedSource,
      variant: "settings",
    }),
    showLinkedFormatNote: isLinked,
    showLocalCopyButton: isLinked && resolvedSource.linkedTemplate !== null,
    templateInputDisabled: isDisabled || isLinked,
  };
}
