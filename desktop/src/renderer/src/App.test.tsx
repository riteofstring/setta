import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { WorkspacePanel } from "./App";
import { ChatModelMenu } from "./components/chat-model-menu";
import { ChatPanel, type ChatView } from "./components/chat-panel";
import { ChatPermissionsMenu } from "./components/chat-permissions-menu";
import { ChatPlusMenu } from "./components/chat-plus-menu";
import { ChatTranscript } from "./components/chat-transcript";
import { EditorPicker } from "./components/editor-picker";
import { SettingsPanel } from "./components/settings-panel";
import {
  NotesContent,
  RulesContent,
  UnorganizedChatsContent,
} from "./components/sidebar-secondary-sections";
import { SlashCommandPalette } from "./components/slash-command-palette";
import { WorkspacePanePanel } from "./components/workspace-pane";
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
          createWorkspaceConversation={async () => {}}
          openLocalFolder={async () => {}}
          openSearch={() => {}}
          openSettingsPane={() => {}}
          recentWorkspaces={[]}
          removeRecent={async () => {}}
          selectConversation={async () => {}}
          selectWorkspace={async () => {}}
          selectedConversationId=""
          selectedWorkspaceId=""
          unreadConversationIds={{}}
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
    expect(html).not.toContain("No projects");
    expect(html).toContain('aria-label="Projects empty"');
    expect(html).toContain('aria-label="Chats empty"');
    expect(html).toContain('aria-label="Notes empty"');
    expect(html).toContain('aria-label="Rules empty"');
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
          createWorkspaceConversation={async () => {}}
          openLocalFolder={async () => {}}
          openSearch={() => {}}
          openSettingsPane={() => {}}
          recentWorkspaces={[web, api, docs]}
          removeRecent={async () => {}}
          selectConversation={async () => {}}
          selectWorkspace={async () => {}}
          selectedConversationId="conversation_web"
          selectedWorkspaceId="workspace_web"
          unreadConversationIds={{ conversation_web: true }}
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
    expect(html).toContain('dateTime="2026-05-29T20:00:00Z"');
    expect(html).toContain('data-testid="conversation-hover-card"');
    expect(html).toContain("No branch");
    expect(html).toContain('title="/tmp/web"');
    expect(html).toContain('title="/tmp/api"');
    expect(html).toContain('data-testid="standalone-chat-section"');
    expect(html).toContain('data-testid="shortcuts-section"');
    expect(html).toContain("Shortcuts");
    expect(html).toContain("New setta gen");
    expect(html).toContain("Chats");
    expect(html).toContain('aria-label="New terminal in web"');
    expect(html).toContain('aria-label="New setta canvas in web"');
    expect(html).toContain('aria-label="New chat in web"');
    expect(html).toContain('aria-label="New standalone terminal"');
    expect(html).toContain('aria-label="New standalone setta canvas"');
    expect(html).toContain('aria-label="New standalone chat"');
    expect(html).toContain('aria-label="Pin Web chat"');
    expect(html).not.toContain("No unorganized chats");
    expect(html).toContain('aria-label="Chats empty"');
    expect(html).toContain("Notes");
    expect(html).toContain('aria-label="New note"');
    expect(html).not.toContain("No Markdown notes");
    expect(html).toContain('aria-label="Notes empty"');
    expect(html).toContain("DB / Memories");
    expect(html).toContain('aria-label="Open settings"');
    expect(html).toContain("Right pane");
    expect(html).toContain("Rules");
    expect(html).toContain('aria-label="New rule"');
    expect(html).not.toContain("No rule canvases");
    expect(html).toContain('aria-label="Rules empty"');
    expect(html).toContain('data-testid="notes-section"');
    expect(html).toContain('data-testid="rules-section"');
    expect(html).toContain('data-testid="sidebar-shortcuts-shell"');
    expect(html).toContain('data-testid="sidebar-scrollable-sections"');
    expect(html).toContain('data-testid="sidebar-memory-footer"');
    expect(html).toContain("Resize Projects");
    expect(html).toContain("Resize Shortcuts");
    expect(html).toContain("Resize Rules");
    expect(html).toContain("Search");
    expect(html).toContain("Notifications / Logs");
    expect(html).toContain("More options for web");
    expect(html).toContain('data-testid="active-workspace-list"');
    expect(html).toContain('data-testid="recent-workspace-list"');
  });

  test("indents secondary sidebar items like project chats", () => {
    const html = renderToString(
      <>
        <UnorganizedChatsContent
          chats={[
            { id: "chat_one", kind: "chat", subtitle: "1m", title: "Scratch chat" },
            { id: "terminal_one", kind: "terminal", subtitle: "terminal", title: "Terminal" },
            { id: "canvas_one", kind: "canvas", subtitle: "canvas", title: "Setta canvas" },
          ]}
        />
        <NotesContent
          notes={[{ id: "note_one", kind: "note", subtitle: "local", title: "Draft note" }]}
        />
        <RulesContent
          rules={[{ id: "rule_one", kind: "rule", subtitle: "node graph", title: "Code review" }]}
        />
      </>,
    );

    expect(rowCount(html, "sidebar-indented-list-item")).toBe(5);
    expect(html).toContain("grid-cols-[18px_minmax(0,1fr)_auto]");
    expect(html).toContain("Scratch chat");
    expect(html).toContain("Terminal");
    expect(html).toContain("Setta canvas");
    expect(html).toContain("Draft note");
    expect(html).toContain("Code review");
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
        createWorkspaceConversation={async () => {}}
        openLocalFolder={async () => {}}
        openSearch={() => {}}
        openSettingsPane={() => {}}
        recentWorkspaces={workspaces}
        removeRecent={async () => {}}
        selectConversation={async () => {}}
        selectWorkspace={async () => {}}
        selectedConversationId=""
        selectedWorkspaceId="workspace_0"
        unreadConversationIds={{}}
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

  test("renders an empty right workspace pane with creation actions", () => {
    const html = renderToString(
      <WorkspacePanePanel
        activeTabId=""
        onCloseTab={() => {}}
        onCreateTab={() => {}}
        onSelectTab={() => {}}
        slot="right"
        tabs={[]}
      />,
    );

    expect(html).toContain('data-testid="right-workspace-pane"');
    expect(html).not.toContain("Right pane");
    expect(html).toContain("New pane tab");
    expect(html).toContain("Canvas");
    expect(html).toContain("Terminal");
    expect(html).toContain("Browser");
    expect(html).toContain("Diffs");
    expect(html).toContain("Files");
    expect(html).toContain("Note");
    expect(html).not.toContain("Settings");
  });

  test("renders workspace pane tabs and active terminal content", () => {
    const html = renderToString(
      <WorkspacePanePanel
        activeTabId="terminal_tab"
        onCloseTab={() => {}}
        onCreateTab={() => {}}
        onSelectTab={() => {}}
        onToggleMaximize={() => {}}
        slot="bottom"
        tabs={[
          {
            id: "terminal_tab",
            kind: "terminal",
            title: "Terminal",
          },
          {
            id: "browser_tab",
            kind: "browser",
            title: "Browser",
          },
        ]}
      />,
    );

    expect(html).toContain('data-testid="bottom-workspace-pane"');
    expect(html).toContain("Maximize bottom pane");
    expect(html).toContain('data-testid="workspace-pane-tab-terminal_tab"');
    expect(html).toContain('data-pane-runtime="libghostty"');
    expect(html).toContain("New pane tab");
    expect(html).toContain("Close Terminal");
    expect(html).toContain("$");
  });

  test("renders the workspace pane new-tab menu with all pane kinds", () => {
    const html = renderToString(
      <WorkspacePanePanel
        activeTabId=""
        initialNewTabMenuOpen
        onCloseTab={() => {}}
        onCreateTab={() => {}}
        onSelectTab={() => {}}
        slot="right"
        tabs={[]}
      />,
    );

    expect(html).toContain('role="menu"');
    expect(html).toContain("Canvas");
    expect(html).toContain("Files");
    expect(html).toContain("Diffs");
    expect(html).toContain("Browser");
    expect(html).toContain("Terminal");
    expect(html).toContain("Note");
    expect(html).not.toContain("Settings");
  });

  test("renders a canvas workspace pane tab", () => {
    const html = renderToString(
      <WorkspacePanePanel
        activeTabId="canvas_tab"
        onCloseTab={() => {}}
        onCreateTab={() => {}}
        onSelectTab={() => {}}
        slot="right"
        tabs={[
          {
            id: "canvas_tab",
            kind: "canvas",
            title: "Canvas",
          },
        ]}
      />,
    );

    expect(html).toContain("Canvas");
    expect(html).toContain('data-pane-runtime="xyflow"');
    expect(html).toContain('data-testid="workspace-pane-tab-canvas_tab"');
  });

  test("renders future pane runtime boundaries", () => {
    const renderPane = (id: string, kind: "browser" | "diffs" | "file" | "note" | "settings") =>
      renderToString(
        <WorkspacePanePanel
          activeTabId={id}
          onCloseTab={() => {}}
          onCreateTab={() => {}}
          onSelectTab={() => {}}
          slot="right"
          tabs={[
            {
              id,
              kind,
              title: kind,
            },
          ]}
        />,
      );

    expect(renderPane("browser_tab", "browser")).toContain('data-pane-runtime="chromium-browser"');
    expect(renderPane("diffs_tab", "diffs")).toContain('data-pane-runtime="pierre-diffs"');
    expect(renderPane("files_tab", "file")).toContain('data-pane-runtime="pierre-trees"');
    expect(renderPane("note_tab", "note")).toContain('data-pane-runtime="renderer-note"');
    expect(renderPane("settings_tab", "settings")).toContain(
      'data-pane-runtime="renderer-settings"',
    );
  });
});

describe("chat renderer states", () => {
  test("renders chat pane maximize control", () => {
    const html = renderToString(
      <ChatPanel
        chat={emptyChatView()}
        chromeInsetTop
        maximized={false}
        onToggleMaximize={() => {}}
        searchOpen={false}
        setSearchOpen={() => {}}
        workspace={{
          displayName: "api",
          id: "workspace_api",
          lastOpenedAt: "2026-05-29T20:00:00Z",
          rootPath: "/tmp/api",
        }}
      />,
    );

    expect(html).toContain("Maximize chat pane");
  });

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

  test("only user messages expose edit actions", () => {
    const html = renderToString(
      <ChatTranscript
        activeRun={null}
        hasMoreOlder={false}
        loadOlder={async () => {}}
        messages={[
          {
            conversationId: "conversation_api",
            createdAt: "2026-05-29T20:00:00Z",
            id: "message_user",
            ordinal: 1,
            parts: [
              {
                format: "plain",
                id: "part_user",
                text: "Can you check this?",
                type: "text",
              },
            ],
            role: "user",
            runId: "",
            schemaVersion: 1,
            status: "complete",
            updatedAt: "2026-05-29T20:00:00Z",
          },
          {
            conversationId: "conversation_api",
            createdAt: "2026-05-29T20:00:01Z",
            id: "message_assistant",
            ordinal: 2,
            parts: [
              {
                format: "markdown",
                id: "part_assistant",
                text: "Done.",
                type: "text",
              },
            ],
            role: "assistant",
            runId: "run_api",
            schemaVersion: 1,
            status: "complete",
            updatedAt: "2026-05-29T20:00:01Z",
          },
        ]}
        submitApproval={async () => {}}
      />,
    );

    expect(html.match(/Edit message/g)).toHaveLength(2);
    expect(html.match(/Copy message/g)).toHaveLength(4);
    expect(html.match(/Pin message/g)).toHaveLength(4);
  });

  test("renders chat-local search controls", () => {
    const html = renderToString(
      <ChatTranscript
        activeRun={null}
        hasMoreOlder={false}
        loadOlder={async () => {}}
        messages={[]}
        searchOpen
        submitApproval={async () => {}}
      />,
    );

    expect(html).toContain("Search chat");
    expect(html).toContain("Previous result");
    expect(html).toContain("Next result");
    expect(html).toContain("Close chat search");
  });

  test("renders ascii spinners for pending assistant and tool messages", () => {
    const html = renderToString(
      <ChatTranscript
        activeRun={null}
        hasMoreOlder={false}
        loadOlder={async () => {}}
        messages={[
          {
            conversationId: "conversation_api",
            createdAt: "2026-05-29T20:00:00Z",
            id: "message_assistant_pending",
            ordinal: 1,
            parts: [],
            role: "assistant",
            runId: "run_api",
            schemaVersion: 1,
            status: "streaming",
            updatedAt: "2026-05-29T20:00:00Z",
          },
          {
            conversationId: "conversation_api",
            createdAt: "2026-05-29T20:00:01Z",
            id: "message_tool_pending",
            ordinal: 2,
            parts: [
              {
                format: "plain",
                id: "part_tool",
                text: "",
                type: "text",
              },
            ],
            role: "tool",
            runId: "run_api",
            schemaVersion: 1,
            status: "streaming",
            updatedAt: "2026-05-29T20:00:01Z",
          },
        ]}
        submitApproval={async () => {}}
      />,
    );

    expect(html).toContain("Assistant response running");
    expect(html).toContain("Tool call running");
  });

  test("renders slash commands and installed skills without pet entry", () => {
    const html = renderToString(<SlashCommandPalette onSelect={() => {}} open query="" />);

    expect(html).toContain("Plan mode");
    expect(html).toContain("Frontend Design");
    expect(html).toContain("Setta will keep working");
    expect(html).not.toContain("Pet");
    expect(html).not.toContain("Codex");
  });

  test("renders chat permission menu options", () => {
    const html = renderToString(<ChatPermissionsMenu disabled={false} initialOpen />);

    expect(html).toContain("Default permissions");
    expect(html).toContain("Auto-review");
    expect(html).toContain("Full access");
    expect(html).toContain("Custom (config.toml)");
    expect(html).not.toContain("Pet");
    expect(html).not.toContain("Codex");
  });

  test("renders chat model selection options", () => {
    const html = renderToString(<ChatModelMenu disabled={false} initialOpen />);

    expect(html).toContain("Reasoning");
    expect(html).toContain("Low");
    expect(html).toContain("Medium");
    expect(html).toContain("High");
    expect(html).toContain("Extra High");
    expect(html).toContain("GPT-5.5");
    expect(html).toContain("Speed");
    expect(html).not.toContain("Pet");
    expect(html).not.toContain("Codex");
  });

  test("renders chat plus menu and plugin submenu", () => {
    const html = renderToString(
      <ChatPlusMenu disabled={false} initialOpen initialPluginSubmenuOpen />,
    );

    expect(html).toContain("Add photos &amp; files");
    expect(html).toContain("Attach Electron");
    expect(html).toContain("Plan mode");
    expect(html).toContain("Pursue goal");
    expect(html).toContain("Plugins");
    expect(html).toContain("4 installed plugins");
    expect(html).toContain("Documents");
    expect(html).toContain("Spreadsheets");
    expect(html).toContain("Presentations");
    expect(html).toContain("Browser");
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

function emptyChatView(): ChatView {
  return {
    activeRun: null,
    conversations: [],
    createConversation: async () => {},
    createWorkspaceConversation: async () => {},
    error: null,
    hasMoreOlder: false,
    loadOlder: async () => {},
    messages: [],
    operation: null,
    selectConversation: async () => {},
    selectedConversation: null,
    sendMessage: async () => {},
    status: "ready",
    stopActiveRun: async () => {},
    submitApproval: async () => {},
    unreadConversationIds: {},
    updateUserMessage: async () => {},
  };
}
