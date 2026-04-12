import type {
  PromptFormat,
  PromptSectionImpl,
  PromptTemplate,
} from "utils/generatedTypes";

type ResolvedPromptSectionSource = {
  format: PromptFormat;
  isLinked: boolean;
  linkedTemplate: PromptTemplate | null;
  linkedTemplateMissing: boolean;
  templateText: string;
};

export function resolvePromptSectionSource(
  promptSection: Pick<
    PromptSectionImpl,
    "format" | "promptTemplateId" | "template"
  >,
  promptTemplates: Array<PromptTemplate>,
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
