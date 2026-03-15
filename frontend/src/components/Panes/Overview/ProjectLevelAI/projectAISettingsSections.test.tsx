import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ProjectAISettingsSections } from "./projectAISettingsSections";

vi.mock("components/Panes/Common/PaneAccordion", () => ({
  PaneAccordion: ({
    items,
  }: {
    items: Array<{
      value: string;
      title: string;
      description: string;
      triggerTestId: string;
      content: ReactNode;
    }>;
  }) => (
    <div data-testid="mock-pane-accordion">
      {items.map((item) => (
        <section key={item.value} data-item-value={item.value}>
          <div data-testid={item.triggerTestId}>
            <span>{item.title}</span>
            <span>{item.description}</span>
          </div>
          <div>{item.content}</div>
        </section>
      ))}
    </div>
  ),
}));

vi.mock("components/Panes/Overview/ProjectLevelAI/ProjectLLMSettings", () => ({
  ProjectLLMSettings: ({ className }: { className?: string }) => (
    <div data-testid="mock-project-llm-settings" data-class-name={className} />
  ),
}));

vi.mock("./projectAISettingsAgentProfiles", () => ({
  ProjectAISettingsAgentProfilesManager: ({
    canEdit,
  }: {
    canEdit: boolean;
  }) => (
    <div data-testid="mock-agent-profiles" data-can-edit={String(canEdit)} />
  ),
}));

vi.mock("./projectAISettingsGuardrails", () => ({
  ProjectAISettingsGuardrails: ({ canEdit }: { canEdit: boolean }) => (
    <div data-testid="mock-guardrails" data-can-edit={String(canEdit)} />
  ),
}));

vi.mock("./projectAISettingsPromptTemplates", () => ({
  ProjectAISettingsPromptTemplatesManager: ({
    canEdit,
  }: {
    canEdit: boolean;
  }) => (
    <div data-testid="mock-prompt-templates" data-can-edit={String(canEdit)} />
  ),
}));

vi.mock("./projectAISettingsTranscriptionProfiles", () => ({
  ProjectAISettingsTranscriptionProfilesManager: ({
    canEdit,
  }: {
    canEdit: boolean;
  }) => (
    <div
      data-testid="mock-transcription-profiles"
      data-can-edit={String(canEdit)}
    />
  ),
}));

vi.mock("./projectAISettingsExternalAgents", () => ({
  ExternalAgentConfigsManager: ({ canEdit }: { canEdit: boolean }) => (
    <div data-testid="mock-external-agents" data-can-edit={String(canEdit)} />
  ),
}));

function renderSectionsMarkup({
  canEdit,
  isDeploymentMode,
}: {
  canEdit: boolean;
  isDeploymentMode: boolean;
}): string {
  return renderToStaticMarkup(
    <ProjectAISettingsSections
      canEdit={canEdit}
      isDeploymentMode={isDeploymentMode}
      openValues={[]}
      onOpenValuesChange={() => {}}
    />,
  );
}

describe("ProjectAISettingsSections", () => {
  it("keeps the accordion section order stable while routing each local owner", () => {
    const markup = renderSectionsMarkup({
      canEdit: true,
      isDeploymentMode: false,
    });

    expect(markup.indexOf("LLM API Keys")).toBeLessThan(
      markup.indexOf("Guardrails"),
    );
    expect(markup.indexOf("Guardrails")).toBeLessThan(
      markup.indexOf("Agent Profiles"),
    );
    expect(markup.indexOf("Agent Profiles")).toBeLessThan(
      markup.indexOf("Transcription Profiles"),
    );
    expect(markup.indexOf("Transcription Profiles")).toBeLessThan(
      markup.indexOf("Prompt Templates"),
    );
    expect(markup.indexOf("Prompt Templates")).toBeLessThan(
      markup.indexOf("External Agents"),
    );
    expect(markup).toContain('data-testid="mock-project-llm-settings"');
    expect(markup).toContain('data-testid="mock-guardrails"');
    expect(markup).toContain('data-testid="mock-agent-profiles"');
    expect(markup).toContain('data-testid="mock-transcription-profiles"');
    expect(markup).toContain('data-testid="mock-prompt-templates"');
    expect(markup).toContain('data-testid="mock-external-agents"');
  });

  it("replaces LLM settings with the share-mode notice while keeping managers read only", () => {
    const markup = renderSectionsMarkup({
      canEdit: false,
      isDeploymentMode: true,
    });

    expect(markup).toContain("LLM settings are unavailable in share mode.");
    expect(markup).not.toContain('data-testid="mock-project-llm-settings"');
    expect(markup).toContain(
      'data-testid="mock-guardrails" data-can-edit="false"',
    );
    expect(markup).toContain(
      'data-testid="mock-agent-profiles" data-can-edit="false"',
    );
    expect(markup).toContain(
      'data-testid="mock-transcription-profiles" data-can-edit="false"',
    );
    expect(markup).toContain(
      'data-testid="mock-prompt-templates" data-can-edit="false"',
    );
    expect(markup).toContain(
      'data-testid="mock-external-agents" data-can-edit="false"',
    );
  });
});
