import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { WorkspacePanel } from "./App";
import { ChatTranscript } from "./components/chat-transcript";
import { EditorPicker } from "./components/editor-picker";
import { SettingsPanel } from "./components/settings-panel";
import { SlashCommandPalette } from "./components/slash-command-palette";
import { WorkspaceSidebar } from "./components/workspace-sidebar";

describe("workspace renderer states", () => {
  test("renders the empty workspace state", () => {
    const html = renderToString(
      <>
        <WorkspaceSidebar
          activeRun={null}
          activeWorkspaces={[]}
          busy={false}
          chatBusy={false}
          closeWorkspace={async () => {}}
          conversations={[]}
          createConversation={async () => {}}
          openLocalFolder={async () => {}}
          recentWorkspaces={[]}
          removeRecent={async () => {}}
          selectConversation={async () => {}}
          selectWorkspace={async () => {}}
          selectedConversationId=""
          selectedWorkspaceId=""
        />
        <WorkspacePanel
          error={null}
          openLocalFolder={async () => {}}
          operation={null}
          selectedWorkspace={null}
          status="idle"
        />
      </>,
    );

    expect(html).toContain("No workspace open");
    expect(html).toContain("No projects");
  });

  test("renders active selected and recent workspace state", () => {
    const api = {
      displayName: "api",
      id: "workspace_api",
      lastOpenedAt: "2026-05-29T20:00:00Z",
      rootPath: "/tmp/api",
    };
    const web = {
      displayName: "web",
      id: "workspace_web",
      lastOpenedAt: "2026-05-29T20:05:00Z",
      rootPath: "/tmp/web",
    };
    const docs = {
      displayName: "docs",
      id: "workspace_docs",
      lastOpenedAt: "2026-05-29T20:10:00Z",
      rootPath: "/tmp/docs",
    };
    const html = renderToString(
      <>
        <WorkspaceSidebar
          activeRun={null}
          activeWorkspaces={[api, web]}
          busy={false}
          chatBusy={false}
          closeWorkspace={async () => {}}
          conversations={[
            {
              activeRunId: "",
              conversation: {
                archivedAt: "",
                createdAt: "2026-05-29T20:00:00Z",
                harnessRefs: [],
                id: "conversation_web",
                schemaVersion: 1,
                title: "Web chat",
                updatedAt: "2026-05-29T20:00:00Z",
                workspaceId: "workspace_web",
              },
              messageCount: 2,
            },
          ]}
          createConversation={async () => {}}
          openLocalFolder={async () => {}}
          recentWorkspaces={[web, api, docs]}
          removeRecent={async () => {}}
          selectConversation={async () => {}}
          selectWorkspace={async () => {}}
          selectedConversationId="conversation_web"
          selectedWorkspaceId="workspace_web"
        />
        <WorkspacePanel
          error={null}
          openLocalFolder={async () => {}}
          operation={null}
          selectedWorkspace={web}
          status="ready"
        />
      </>,
    );

    expect(html).toContain("web");
    expect(html).toContain("/tmp/web");
    expect(html).toContain("Active");
    expect(html).toContain("Web chat");
    expect(html).toContain("New chat in web");
    expect(html).toContain("More options for web");
    expect(html).toContain('data-testid="active-workspace-list"');
    expect(html).toContain('data-testid="recent-workspace-list"');
  });

  test("renders loading and error states", () => {
    const html = renderToString(
      <WorkspacePanel
        error="workspace path does not exist"
        openLocalFolder={async () => {}}
        operation="opening"
        selectedWorkspace={null}
        status="error"
      />,
    );

    expect(html).toContain("Opening");
    expect(html).toContain("workspace path does not exist");
    expect(html).toContain('data-testid="workspace-error"');
  });

  test("bounds large workspace list row rendering", () => {
    const workspaces = Array.from({ length: 3000 }, (_, index) => ({
      displayName: `Workspace ${index}`,
      id: `workspace_${index}`,
      lastOpenedAt: "2026-05-29T20:00:00Z",
      rootPath: `/tmp/workspace-${index}`,
    }));

    const html = renderToString(
      <WorkspaceSidebar
        activeRun={null}
        activeWorkspaces={workspaces}
        busy={false}
        chatBusy={false}
        closeWorkspace={async () => {}}
        conversations={[]}
        createConversation={async () => {}}
        openLocalFolder={async () => {}}
        recentWorkspaces={workspaces}
        removeRecent={async () => {}}
        selectConversation={async () => {}}
        selectWorkspace={async () => {}}
        selectedConversationId=""
        selectedWorkspaceId="workspace_0"
      />,
    );

    expect(rowCount(html, "active-workspace-item")).toBeLessThan(30);
    expect(rowCount(html, "recent-workspace-item")).toBeLessThan(30);
  });

  test("renders the compact shell editor picker", () => {
    const html = renderToString(<EditorPicker rootPath="/tmp/web" />);

    expect(html).toContain("Choose editor");
    expect(html).not.toContain("VS Code");
  });
});

describe("chat renderer states", () => {
  test("renders markdown messages without trusting raw html", () => {
    const html = renderToString(
      <ChatTranscript
        activeRun={null}
        hasMoreOlder={false}
        loadOlder={async () => {}}
        messages={[
          {
            conversationId: "conversation_api",
            createdAt: "2026-05-29T20:00:00Z",
            id: "message_assistant",
            ordinal: 1,
            parts: [
              {
                format: "markdown",
                id: "part_assistant",
                text: "**Done** `<script>`",
                type: "text",
              },
            ],
            role: "assistant",
            runId: "run_api",
            schemaVersion: 1,
            status: "complete",
            updatedAt: "2026-05-29T20:00:00Z",
          },
        ]}
        submitApproval={async () => {}}
      />,
    );

    expect(html).toContain("<strong");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  test("renders slash commands and installed skills without pet entry", () => {
    const html = renderToString(<SlashCommandPalette onSelect={() => {}} open query="" />);

    expect(html).toContain("Plan mode");
    expect(html).toContain("Frontend Design");
    expect(html).toContain("Setta will keep working");
    expect(html).not.toContain("Pet");
    expect(html).not.toContain("Codex");
  });

  test("renders pending approval controls", () => {
    const html = renderToString(
      <ChatTranscript
        activeRun={{
          completedAt: "",
          conversationId: "conversation_api",
          error: "",
          harness: "setta",
          hasPendingApproval: true,
          id: "run_api",
          pendingApproval: {
            approved: false,
            body: "Setta wants permission",
            command: "go test ./...",
            createdAt: "2026-05-29T20:00:00Z",
            filePath: "",
            id: "approval_api",
            kind: "command",
            options: [],
            questions: [],
            permission: "",
            question: "",
            resolvedAt: "",
            response: "",
            runId: "run_api",
            status: "pending",
            title: "Run command",
          },
          promptSummary: "test",
          schemaVersion: 1,
          startedAt: "2026-05-29T20:00:00Z",
          status: "running",
          triggerMessageId: "message_user",
          workspaceId: "workspace_api",
        }}
        hasMoreOlder={false}
        loadOlder={async () => {}}
        messages={[]}
        submitApproval={async () => {}}
      />,
    );

    expect(html).toContain("Run command");
    expect(html).toContain("go test ./...");
    expect(html).toContain("Approve");
    expect(html).toContain("Deny");
  });

  test("renders user input approval answer controls", () => {
    const html = renderToString(
      <ChatTranscript
        activeRun={{
          completedAt: "",
          conversationId: "conversation_api",
          error: "",
          harness: "setta",
          hasPendingApproval: true,
          id: "run_api",
          pendingApproval: {
            approved: false,
            body: "Choose a branch",
            command: "",
            createdAt: "2026-05-29T20:00:00Z",
            filePath: "",
            id: "approval_api",
            kind: "user_input",
            options: ["main", "release"],
            permission: "",
            question: "Which branch should Setta use?",
            questions: [
              {
                header: "Branch",
                id: "branch",
                isOther: false,
                isSecret: false,
                options: ["main", "release"],
                question: "Which branch should Setta use?",
              },
              {
                header: "Mode",
                id: "mode",
                isOther: false,
                isSecret: false,
                options: ["fast", "careful"],
                question: "Which mode?",
              },
            ],
            resolvedAt: "",
            response: "",
            runId: "run_api",
            status: "pending",
            title: "Branch",
          },
          promptSummary: "test",
          schemaVersion: 1,
          startedAt: "2026-05-29T20:00:00Z",
          status: "running",
          triggerMessageId: "message_user",
          workspaceId: "workspace_api",
        }}
        hasMoreOlder={false}
        loadOlder={async () => {}}
        messages={[]}
        submitApproval={async () => {}}
      />,
    );

    expect(html).toContain("Which branch should Setta use?");
    expect(html).toContain("main");
    expect(html).toContain("release");
    expect(html).toContain("Answer");
    expect(html).toContain("Cancel");
  });
});

describe("settings renderer states", () => {
  test("renders compact settings sections", () => {
    const html = renderToString(<SettingsPanel />);

    expect(html).toContain("Settings");
    expect(html).toContain("Shell");
    expect(html).toContain("Chat");
    expect(html).toContain("Projects");
    expect(html).toContain("Views");
    expect(html).toContain("Integrations");
    expect(html).toContain("Shortcuts");
    expect(html).toContain("Storage");
    expect(html).toContain("Native title bar");
  });
});

function rowCount(html: string, testId: string) {
  return html.split(`data-testid="${testId}"`).length - 1;
}
