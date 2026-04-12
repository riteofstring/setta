import { FormatEnum, type Template } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  resolvePromptAreaUiState,
  resolvePromptSectionSource,
  resolvePromptSettingsUiState,
} from "./promptSectionSource";

const linkedTemplate: Template = {
  id: "template-1",
  name: "Greeting",
  description: "Greets a person",
  template: "Hello {{ name }}",
  format: FormatEnum.Jinja,
  inputSchema: {},
  metadata: {},
};

function resolveSource(
  promptTemplateId: string | null,
  promptTemplates: Array<Template>,
) {
  return resolvePromptSectionSource(
    {
      promptTemplateId,
      template: "stale snapshot",
      format: FormatEnum.Jinja,
    },
    promptTemplates,
  );
}

describe("promptSectionSource", () => {
  it("reports missing linked templates for layout views once template loading completes", () => {
    const resolvedSource = resolveSource("missing-template", []);

    expect(
      resolvePromptAreaUiState({
        canEditParams: true,
        isDeploymentMode: false,
        isFrozen: false,
        maxHeight: "240px",
        promptTemplateId: "missing-template",
        promptTemplatesInitialLoadComplete: false,
        renderError: "Missing variables: name",
        resolvedSource,
        templateValue: "local draft",
        viewMode: "template",
      }).linkedTemplateInfo,
    ).toBe("Loading linked prompt template...");

    expect(
      resolvePromptAreaUiState({
        canEditParams: true,
        isDeploymentMode: false,
        isFrozen: false,
        maxHeight: "240px",
        promptTemplateId: "missing-template",
        promptTemplatesInitialLoadComplete: true,
        renderError: "Missing variables: name",
        resolvedSource,
        templateValue: "local draft",
        viewMode: "template",
      }),
    ).toMatchObject({
      editorValue: "",
      errorText: "Linked prompt template could not be found.",
      linkedTemplateInfo:
        "This section is linked to a prompt template that could not be loaded. Choose a different prompt template in section settings.",
    });
  });

  it("uses linked template text and notices when a prompt template is present", () => {
    const resolvedSource = resolveSource(linkedTemplate.id, [linkedTemplate]);

    expect(
      resolvePromptAreaUiState({
        canEditParams: true,
        isDeploymentMode: false,
        isFrozen: false,
        maxHeight: "240px",
        promptTemplateId: linkedTemplate.id,
        promptTemplatesInitialLoadComplete: true,
        renderError: null,
        resolvedSource,
        templateValue: "local draft",
        viewMode: "template",
      }),
    ).toMatchObject({
      editorMaxHeight: "calc(240px - 32px)",
      editorValue: linkedTemplate.template,
      isReadOnly: true,
      linkedTemplateInfo:
        'Linked to prompt template "Greeting". Edit it in Project AI Settings or make a local copy in section settings.',
    });
  });

  it("disables settings editing when deployment sharing blocks parameter changes", () => {
    const resolvedSource = resolveSource(linkedTemplate.id, [linkedTemplate]);

    expect(
      resolvePromptSettingsUiState({
        canEditParams: false,
        isDeploymentMode: true,
        isFrozen: false,
        promptTemplateId: linkedTemplate.id,
        promptTemplatesInitialLoadComplete: true,
        resolvedSource,
      }),
    ).toMatchObject({
      isDisabled: true,
      linkedTemplateDescription: "Greets a person",
      linkedTemplateInfo:
        'This section is linked by id to prompt template "Greeting". Edit the template in Project AI Settings, or make a local copy to edit here.',
      showLinkedFormatNote: true,
      showLocalCopyButton: true,
      templateInputDisabled: true,
    });
  });
});
