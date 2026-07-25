import { Settings } from "lucide-react";

import { SettingsPanel } from "../components/settings-panel";

export function WorkspaceSettingsSurface({ active, loaded }: { active: boolean; loaded: boolean }) {
  return (
    <section className="workspace-dom-surface" data-testid="workspace-settings-dom-surface">
      <header className="workspace-dom-surface-header workspace-dom-surface-header-compact">
        <Settings className="h-3.5 w-3.5" />
        <div className="min-w-0">
          <h2>Settings</h2>
          <p>real settings wrapper</p>
        </div>
      </header>
      <div className="workspace-real-dom-surface-body" data-inactive={String(!active)}>
        {loaded ? <SettingsPanel /> : <UnloadedPanePlaceholder label="Settings not loaded" />}
      </div>
    </section>
  );
}

function UnloadedPanePlaceholder({ label }: { label: string }) {
  return (
    <div
      aria-label={label}
      className="workspace-unloaded-surface-placeholder"
      data-testid="workspace-unloaded-surface-placeholder"
      role="img"
    >
      <Settings aria-hidden="true" className="h-6 w-6" />
    </div>
  );
}
