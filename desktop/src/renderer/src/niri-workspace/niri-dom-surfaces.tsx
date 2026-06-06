import type { WorkspaceSummary } from "@generated/backend";
import { MessageSquare, Settings } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ChatPanel, useChatViewState } from "../components/chat-panel";
import { SettingsPanel } from "../components/settings-panel";
import { useWorkspaceStore } from "../stores/workspace-store";
import type { NiriPane } from "./types";

const fakeLongChatMessageCount = 180;

export function FakeLongChatSurface({ pane }: { pane: NiriPane }) {
  const messages = useMemo(() => fakeLongChatMessages(pane.sequence), [pane.sequence]);

  return (
    <section className="niri-dom-surface niri-fake-long-chat" data-testid="niri-fake-long-chat">
      <header className="niri-dom-surface-header">
        <MessageSquare className="h-3.5 w-3.5" />
        <div className="min-w-0">
          <h2>{pane.title}</h2>
          <p>static long-chat DOM workload</p>
        </div>
      </header>
      <div className="niri-fake-long-chat-scroll" aria-label="Fake long chat transcript">
        {messages.map((message) => (
          <article className="niri-fake-long-chat-message" key={message.id}>
            <span>{message.role}</span>
            <p>{message.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function NiriSettingsSurface({ active }: { active: boolean }) {
  return (
    <section className="niri-dom-surface" data-testid="niri-settings-dom-surface">
      <header className="niri-dom-surface-header niri-dom-surface-header-compact">
        <Settings className="h-3.5 w-3.5" />
        <div className="min-w-0">
          <h2>Settings</h2>
          <p>real settings wrapper</p>
        </div>
      </header>
      <div className="niri-real-dom-surface-body" data-inactive={String(!active)}>
        {active ? <SettingsPanel /> : null}
      </div>
    </section>
  );
}

export function NiriChatSurface() {
  const workspace = useSelectedWorkspace();
  const chat = useChatViewState();
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    const handleSearchShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "f") {
        return;
      }
      event.preventDefault();
      setSearchOpen(true);
    };
    window.addEventListener("keydown", handleSearchShortcut);
    return () => window.removeEventListener("keydown", handleSearchShortcut);
  }, []);

  return (
    <section className="niri-dom-surface" data-testid="niri-chat-dom-surface">
      <div className="niri-real-dom-surface-body">
        <ChatPanel
          chat={chat}
          searchOpen={searchOpen}
          setSearchOpen={setSearchOpen}
          workspace={workspace}
        />
      </div>
    </section>
  );
}

function useSelectedWorkspace(): WorkspaceSummary | null {
  const session = useWorkspaceStore((state) => state.session);

  return useMemo(() => {
    if (!session) {
      return null;
    }
    return (
      session.activeWorkspaces.find((workspace) => workspace.id === session.selectedWorkspaceId) ??
      null
    );
  }, [session]);
}

function fakeLongChatMessages(seed: number): Array<{
  body: string;
  id: string;
  role: string;
}> {
  return Array.from({ length: fakeLongChatMessageCount }, (_, index) => {
    const role = index % 3 === 0 ? "assistant" : "user";
    const shard = (seed * 17 + index * 31) % 97;
    return {
      body: `Synthetic transcript row ${index + 1} with stable text, token shard ${shard}, and enough inline content to exercise long DOM layout without store updates.`,
      id: `fake_long_chat_${seed}_${index}`,
      role,
    };
  });
}
