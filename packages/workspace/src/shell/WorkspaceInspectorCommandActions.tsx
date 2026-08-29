import type { ReactNode } from "react";
import {
  useWorkspaceCommandEntries,
  type WorkspaceCommandEntry,
} from "../commands/workspaceCommandResolution";
import type {
  WorkspaceCommandContext,
  WorkspaceCommandSurface,
} from "../commands/workspaceCommandTypes";

type WorkspaceInspectorCommandActionsProps = {
  // Selection properties the Inspector edits in place, such as the lock state of a multiple
  // selection, share the row with its commands instead of forming a second row.
  children?: ReactNode;
  contexts: ReadonlyArray<WorkspaceCommandContext>;
  focusKey: string;
  onStatusChange: (message: string) => void;
  surface: WorkspaceCommandSurface;
};

function CommandActionRow({
  children,
  entries,
  focusKey,
  onStatusChange,
}: {
  children?: ReactNode;
  entries: ReadonlyArray<WorkspaceCommandEntry>;
  focusKey: string;
  onStatusChange: (message: string) => void;
}) {
  // Disabled entries explain themselves once, with the same sentence the menus attach to their
  // items, so two commands blocked by one lock print one reason.
  const reasons = [
    ...new Set(
      entries.flatMap((entry) =>
        entry.disabledReason === null ? [] : [entry.disabledReason],
      ),
    ),
  ];
  return (
    <>
      <div
        className="setta-workspace-inspector-actions"
        data-inspector-focus-key={focusKey}
      >
        {children}
        {entries.map((entry) => (
          <button
            className={
              entry.tone === "danger"
                ? "setta-workspace-inspector-danger-action"
                : undefined
            }
            disabled={entry.disabled}
            key={entry.id}
            onClick={() => {
              const result = entry.run();
              if (result.statusMessage !== null) {
                onStatusChange(result.statusMessage);
              }
            }}
            type="button"
          >
            {entry.label}
          </button>
        ))}
      </div>
      {reasons.map((reason) => (
        <p className="setta-workspace-inspector-help" key={reason}>
          {reason}
        </p>
      ))}
    </>
  );
}

// One Inspector row per command surface. A row that resolves to nothing renders nothing, so a
// selection without applicable commands keeps the accepted empty layout.
export function WorkspaceInspectorCommandActions({
  children,
  contexts,
  focusKey,
  onStatusChange,
  surface,
}: WorkspaceInspectorCommandActionsProps) {
  const entries = useWorkspaceCommandEntries(surface, contexts);
  if (entries.length === 0 && children === undefined) {
    return null;
  }
  return (
    <CommandActionRow
      entries={entries}
      focusKey={focusKey}
      onStatusChange={onStatusChange}
    >
      {children}
    </CommandActionRow>
  );
}
