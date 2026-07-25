import { ArrowLeft, LoaderCircle, Send } from "lucide-react";
import { type FormEvent, useState } from "react";

import type { SideConversation } from "@generated/backend";

import type { EasyButtonConversationCommands } from "./easy-button-conversation-commands";
import type { EasyButtonSideView } from "./easy-button-side-projection";

export function EasyButtonSideConversation({
  commands,
  parentTitle,
  side,
}: {
  commands: EasyButtonConversationCommands | undefined;
  parentTitle: string;
  side: EasyButtonSideView;
}) {
  return (
    <section
      aria-label={`Side conversation for ${parentTitle}`}
      className="easy-button-side"
      data-side-conversation-id={side.id}
      data-side-conversation-status={side.status}
      data-testid="easy-button-side-conversation"
    >
      <SideHeader commands={commands} parentTitle={parentTitle} side={side} />
      <SideTranscript commandError={commands?.error ?? null} side={side} />
      <SideComposer commands={commands} side={side} />
    </section>
  );
}

function SideHeader({
  commands,
  parentTitle,
  side,
}: {
  commands: EasyButtonConversationCommands | undefined;
  parentTitle: string;
  side: EasyButtonSideView;
}) {
  return (
    <header className="easy-button-side-header">
      <div className="easy-button-side-heading">
        <span>Temporary side conversation</span>
        <h2>{parentTitle}</h2>
      </div>
      <ParentStatus status={side.parentStatus} />
      <button
        className="easy-button-side-end"
        data-testid="easy-button-side-end"
        disabled={!commands || commands.pending || side.status === "preparing"}
        onClick={() => commands?.disposeSide(side.id)}
        type="button"
      >
        <ArrowLeft aria-hidden="true" />
        Return to parent
      </button>
    </header>
  );
}

function SideTranscript({
  commandError,
  side,
}: {
  commandError: string | null;
  side: EasyButtonSideView;
}) {
  return (
    <div
      aria-live="polite"
      className="easy-button-side-transcript"
      data-testid="easy-button-side-transcript"
      role="log"
    >
      {side.hasEarlierEvents ? (
        <p className="easy-button-side-history-note">Earlier side activity is not loaded.</p>
      ) : null}
      {side.messages.map((message) => (
        <article
          className="easy-button-side-message"
          data-side-message-role={message.role}
          key={message.id}
        >
          <span>{sideMessageRoleLabel(message.role)}</span>
          <p>{message.text}</p>
        </article>
      ))}
      {side.messages.length === 0 ? <SideEmptyState side={side} /> : null}
      {side.turnActive ? (
        <p className="easy-button-side-working" role="status">
          <LoaderCircle aria-hidden="true" />
          Side agent working…
        </p>
      ) : null}
      {side.failure ? <SideFailure testId="easy-button-side-failure" text={side.failure} /> : null}
      {commandError ? (
        <SideFailure testId="easy-button-side-command-error" text={commandError} />
      ) : null}
    </div>
  );
}

function sideMessageRoleLabel(role: EasyButtonSideView["messages"][number]["role"]): string {
  switch (role) {
    case "assistant":
      return "Side agent";
    case "status":
      return "Turn status";
    case "user":
      return "You";
    default:
      return assertNever(role);
  }
}

function SideFailure({ testId, text }: { testId: string; text: string }) {
  return (
    <p className="easy-button-side-failure" data-testid={testId} role="alert">
      {text}
    </p>
  );
}

function SideComposer({
  commands,
  side,
}: {
  commands: EasyButtonConversationCommands | undefined;
  side: EasyButtonSideView;
}) {
  const [input, setInput] = useState("");
  const canSend = sideCanSend(side, commands, input);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!canSend || !commands) {
      return;
    }
    if (await commands.sendSide(side.id, input.trim())) {
      setInput("");
    }
  }

  return (
    <form className="easy-button-side-composer" onSubmit={submit}>
      <input
        aria-label="Side conversation request"
        data-testid="easy-button-side-input"
        disabled={sideComposerInputDisabled(side, commands)}
        onChange={(event) => setInput(event.target.value)}
        placeholder={sideComposerPlaceholder(side)}
        type="text"
        value={input}
      />
      <button
        aria-label="Send to side agent"
        data-testid="easy-button-side-submit"
        disabled={!canSend}
        type="submit"
      >
        <Send aria-hidden="true" />
        Send
      </button>
    </form>
  );
}

function sideCanSend(
  side: EasyButtonSideView,
  commands: EasyButtonConversationCommands | undefined,
  input: string,
): boolean {
  return (
    side.status === "active" &&
    !side.turnActive &&
    Boolean(commands?.workspaceCommandsAvailable) &&
    !commands?.pending &&
    input.trim() !== ""
  );
}

function sideComposerInputDisabled(
  side: EasyButtonSideView,
  commands: EasyButtonConversationCommands | undefined,
): boolean {
  return side.status !== "active" || side.turnActive || !commands?.workspaceCommandsAvailable;
}

function ParentStatus({ status }: { status: SideConversation["parentStatus"] }) {
  return (
    <p
      className="easy-button-side-parent-status"
      data-parent-conversation-status={status}
      data-testid="easy-button-side-parent-status"
    >
      Parent: {parentStatusLabel(status)}
    </p>
  );
}

function SideEmptyState({ side }: { side: EasyButtonSideView }) {
  return (
    <p className="easy-button-side-empty" role="status">
      {sideStatusLabel(side)}
    </p>
  );
}

function sideComposerPlaceholder(side: EasyButtonSideView): string {
  if (side.status === "failed") {
    return "Side conversation unavailable";
  }
  if (side.status === "preparing") {
    return "Preparing side agent…";
  }
  if (side.status === "disposing") {
    return "Ending side conversation…";
  }
  return side.turnActive ? "Side agent is working…" : "Ask the side agent…";
}

function sideStatusLabel(side: EasyButtonSideView): string {
  switch (side.status) {
    case "preparing":
      return "Preparing the side agent…";
    case "active":
      return side.turnActive ? "The side agent is working…" : "The side agent is ready.";
    case "disposing":
      return "Ending this side conversation…";
    case "failed":
      return "The side conversation is unavailable.";
    default:
      return assertNever(side.status);
  }
}

function parentStatusLabel(status: SideConversation["parentStatus"]): string {
  switch (status) {
    case "idle":
      return "Ready";
    case "working":
      return "Working";
    case "waiting_for_approval":
      return "Waiting for approval";
    case "failed":
      return "Failed";
    default:
      return assertNever(status);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported side presentation state: ${String(value)}`);
}
