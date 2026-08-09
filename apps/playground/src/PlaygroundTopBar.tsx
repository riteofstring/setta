import type { WorkspaceAppearance } from "@setta/workspace/core";
import type { WorkspaceSectionMoveMode } from "@setta/workspace/react";
import type { RefObject } from "react";

export type PlaygroundPanelId = "data" | "help" | "settings";

export type PlaygroundPanelTriggerRefs = Readonly<
  Record<PlaygroundPanelId, RefObject<HTMLButtonElement | null>>
>;

type PlaygroundTopBarProps = Readonly<{
  activePanel: PlaygroundPanelId | null;
  announcement: string;
  appearance: WorkspaceAppearance;
  moveMode: WorkspaceSectionMoveMode;
  onAppearanceChange(appearance: WorkspaceAppearance): void;
  onMoveModeChange(moveMode: WorkspaceSectionMoveMode): void;
  onTogglePanel(panel: PlaygroundPanelId): void;
  triggerRefs: PlaygroundPanelTriggerRefs;
}>;

const PANEL_TRIGGERS = [
  { id: "help", label: "Help" },
  { id: "settings", label: "Settings" },
  { id: "data", label: "Data" },
] as const;

export function PlaygroundTopBar({
  activePanel,
  announcement,
  appearance,
  moveMode,
  onAppearanceChange,
  onMoveModeChange,
  onTogglePanel,
  triggerRefs,
}: PlaygroundTopBarProps) {
  return (
    <header className="playground-topbar">
      <div className="playground-topbar__brand">
        <h1 translate="no">Setta Workspace</h1>
        <p className="playground-topbar__badge">Playground</p>
      </div>
      <p aria-live="polite" className="announcement playground-topbar__status" role="status">
        {announcement}
      </p>
      <div className="playground-topbar__controls">
        <label>
          Move sections
          <select
            onChange={(event) =>
              onMoveModeChange(event.currentTarget.value as WorkspaceSectionMoveMode)
            }
            value={moveMode}
          >
            <option value="sort">Sort</option>
            <option value="free">Free move</option>
          </select>
        </label>
        <label>
          Theme
          <select
            onChange={(event) =>
              onAppearanceChange(event.currentTarget.value as WorkspaceAppearance)
            }
            value={appearance}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        {PANEL_TRIGGERS.map(({ id, label }) => (
          <button
            aria-controls={`playground-panel-${id}`}
            aria-expanded={activePanel === id}
            key={id}
            onClick={() => onTogglePanel(id)}
            ref={triggerRefs[id]}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
    </header>
  );
}
