import type { AppearanceDeveloperSettings } from "@generated/backend";
import { Check, CircleAlert, Gauge, Loader2, RotateCcw, Save } from "lucide-react";

import { Button } from "./ui/button";
import { Input } from "./ui/input";
import type { AppearanceStoreStatus } from "../stores/appearance-store";

interface DeveloperSettingsEditorProps {
  developer: AppearanceDeveloperSettings | null;
  dirty: boolean;
  error: string | null;
  onClampResizedPanesToViewportChange: (clamp: boolean) => void;
  onEnableWorkspaceRowsChange: (enabled: boolean) => void;
  onOverviewCardWidthBoundsChange: (minWidthPx: number, maxWidthPx: number) => void;
  onRevert: () => void;
  onSave: () => Promise<void>;
  onShowPerformanceStatsChange: (show: boolean) => void;
  status: AppearanceStoreStatus;
}

export function DeveloperSettingsEditor({
  developer,
  dirty,
  error,
  onClampResizedPanesToViewportChange,
  onEnableWorkspaceRowsChange,
  onOverviewCardWidthBoundsChange,
  onRevert,
  onSave,
  onShowPerformanceStatsChange,
  status,
}: DeveloperSettingsEditorProps) {
  const busy = status === "loading" || status === "saving";

  return (
    <form
      className="grid gap-3"
      data-testid="developer-settings"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave();
      }}
    >
      <header className="flex min-h-8 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Gauge className="h-4 w-4 shrink-0 text-muted-foreground" />
          <h2 className="truncate text-xs font-semibold tracking-wide text-foreground">
            Developer
          </h2>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
          <Button disabled={!dirty || busy} onClick={onRevert} type="button">
            <RotateCcw className="h-3.5 w-3.5" />
            Revert
          </Button>
          <Button disabled={!dirty || busy} type="submit" variant="primary">
            {status === "saving" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Save
          </Button>
        </div>
      </header>
      <DeveloperSettingsStatus status={status} dirty={dirty} error={error} />
      {developer ? (
        <section className="grid gap-1 rounded-sm border border-border bg-card/30 px-3 py-2.5">
          <DeveloperToggle
            checked={!developer.allowResizedPanesToOverflowViewport}
            label="Clamp resized panes to viewport"
            onChange={onClampResizedPanesToViewportChange}
          />
          <DeveloperToggle
            checked={developer.enableWorkspaceRows}
            description="Allow pane focus, movement, and placement above or below the main row."
            label="Multiple workspace rows"
            onChange={onEnableWorkspaceRowsChange}
          />
          <DeveloperToggle
            checked={developer.showPerformanceStats}
            label="Top bar performance stats"
            onChange={onShowPerformanceStatsChange}
          />
          <div className="grid gap-2 border-t border-border/70 pt-2 sm:grid-cols-2">
            <OverviewCardWidthField
              label="Overview card min width"
              onChange={(minWidthPx) =>
                onOverviewCardWidthBoundsChange(
                  minWidthPx,
                  Math.max(minWidthPx, developer.overviewCardMaxWidthPx),
                )
              }
              value={developer.overviewCardMinWidthPx}
            />
            <OverviewCardWidthField
              label="Overview card max width"
              onChange={(maxWidthPx) =>
                onOverviewCardWidthBoundsChange(
                  Math.min(maxWidthPx, developer.overviewCardMinWidthPx),
                  maxWidthPx,
                )
              }
              value={developer.overviewCardMaxWidthPx}
            />
          </div>
        </section>
      ) : (
        <div className="flex h-16 items-center gap-2 rounded-sm border border-border px-3 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading developer settings
        </div>
      )}
    </form>
  );
}

function OverviewCardWidthField({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-xs font-medium text-foreground">{label}</span>
      <span className="flex items-center gap-1">
        <Input
          inputMode="numeric"
          onChange={(event) => {
            const next = Number.parseInt(event.currentTarget.value, 10);
            if (Number.isFinite(next)) {
              onChange(next);
            }
          }}
          step={20}
          type="number"
          value={value}
        />
        <span className="shrink-0 text-xs text-muted-foreground">px</span>
      </span>
    </label>
  );
}

function DeveloperToggle({
  checked,
  description,
  label,
  onChange,
}: {
  checked: boolean;
  description?: string;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-10 items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="block text-xs font-medium text-foreground">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">
            {description}
          </span>
        ) : null}
      </span>
      <span className="relative inline-flex h-6 w-10 shrink-0 items-center">
        <input
          checked={checked}
          className="peer sr-only"
          onChange={(event) => onChange(event.currentTarget.checked)}
          type="checkbox"
        />
        <span className="h-5 w-9 rounded-full border border-border bg-muted transition-colors peer-checked:border-primary peer-checked:bg-primary" />
        <span className="pointer-events-none absolute left-0.5 h-4 w-4 rounded-full bg-foreground/80 transition-transform peer-checked:translate-x-4 peer-checked:bg-primary-foreground" />
      </span>
    </label>
  );
}

function DeveloperSettingsStatus({
  dirty,
  error,
  status,
}: {
  dirty: boolean;
  error: string | null;
  status: AppearanceStoreStatus;
}) {
  if (error) {
    return (
      <div className="flex min-w-0 items-start gap-2 rounded-sm border border-status-critical bg-status-critical/15 px-2 py-1.5 text-xs text-status-critical">
        <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 break-words">{error}</span>
      </div>
    );
  }
  if (status === "saving") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Saving developer settings
      </div>
    );
  }
  if (dirty) {
    return <div className="text-xs text-muted-foreground">Unsaved developer changes</div>;
  }
  if (status === "ready") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Check className="h-3.5 w-3.5" />
        Developer settings saved
      </div>
    );
  }
  return null;
}
