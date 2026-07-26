import type {
  AppearanceMasterVoiceShortcut,
  AppearanceShortcutsSettings,
  AppearanceWorkspaceNavigationShortcut,
} from "@generated/backend";
import type { DesktopPlatform } from "@shared/types";
import { Check, CircleAlert, Keyboard, Loader2, Mic, RotateCcw, Save } from "lucide-react";

import { Button } from "./ui/button";
import { masterVoiceShortcutParts } from "../features/global-master/master-shortcuts";
import { cn } from "../lib/utils";
import type { AppearanceStoreStatus } from "../stores/appearance-store";

interface ShortcutSettingsEditorProps {
  dirty: boolean;
  error: string | null;
  onMasterVoiceChange: (shortcut: AppearanceMasterVoiceShortcut) => void;
  onRevert: () => void;
  onSave: () => Promise<void>;
  onWorkspaceNavigationChange: (shortcut: AppearanceWorkspaceNavigationShortcut) => void;
  platform: DesktopPlatform;
  shortcuts: AppearanceShortcutsSettings | null;
  status: AppearanceStoreStatus;
}

const workspaceNavigationOptions = [
  {
    label: "Mod + Alt Arrows",
    value: "mod_alt_arrows",
  },
  {
    label: "Ctrl + Alt Arrows",
    value: "ctrl_alt_arrows",
  },
] as const satisfies Array<{
  label: string;
  value: AppearanceWorkspaceNavigationShortcut;
}>;

const masterVoiceOptions = [
  {
    label: "Mod + Shift + K",
    value: "mod_shift_k",
  },
  {
    label: "Ctrl + Shift + K",
    value: "ctrl_shift_k",
  },
  {
    label: "Alt + Shift + K",
    value: "alt_shift_k",
  },
] as const satisfies Array<{
  label: string;
  value: AppearanceMasterVoiceShortcut;
}>;

export function ShortcutSettingsEditor({
  dirty,
  error,
  onMasterVoiceChange,
  onRevert,
  onSave,
  onWorkspaceNavigationChange,
  platform,
  shortcuts,
  status,
}: ShortcutSettingsEditorProps) {
  const busy = status === "loading" || status === "saving";

  return (
    <form
      className="grid gap-3"
      data-testid="shortcut-settings"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave();
      }}
    >
      <header className="flex min-h-8 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Keyboard className="h-4 w-4 shrink-0 text-muted-foreground" />
          <h2 className="truncate text-xs font-semibold tracking-wide text-foreground">
            Shortcuts
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
      <ShortcutSettingsStatus status={status} dirty={dirty} error={error} />
      {shortcuts ? (
        <>
          <section className="grid gap-2 rounded-sm border border-border bg-card/30 px-3 py-2.5">
            <div className="flex min-h-7 items-center justify-between gap-3">
              <h3 className="truncate text-xs font-semibold text-foreground">
                Workspace Navigation
              </h3>
              <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                {workspaceNavigationSummary(shortcuts.workspaceNavigation)}
              </span>
            </div>
            <div
              aria-label="Workspace navigation shortcut"
              className="grid gap-2 sm:grid-cols-2"
              role="radiogroup"
            >
              {workspaceNavigationOptions.map((option) => {
                const selected = shortcuts.workspaceNavigation === option.value;
                return (
                  <button
                    aria-checked={selected}
                    className={cn(
                      "grid min-h-20 gap-2 rounded-sm border border-border bg-background/40 px-3 py-2 text-left outline-none transition-colors hover:border-primary/60 focus-visible:border-ring",
                      selected && "border-primary bg-primary/10",
                    )}
                    key={option.value}
                    onClick={() => onWorkspaceNavigationChange(option.value)}
                    role="radio"
                    type="button"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-foreground">{option.label}</span>
                      <span
                        className={cn(
                          "flex h-4 w-4 items-center justify-center rounded-full border border-border",
                          selected && "border-primary bg-primary text-primary-foreground",
                        )}
                      >
                        {selected ? <Check className="h-3 w-3" /> : null}
                      </span>
                    </span>
                    <ShortcutChord value={focusShortcutLabel(option.value)} />
                  </button>
                );
              })}
            </div>
          </section>
          <section className="grid gap-2 rounded-sm border border-border bg-card/30 px-3 py-2.5">
            <div className="flex min-h-7 items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <Mic className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <h3 className="truncate text-xs font-semibold text-foreground">
                  Global Master Voice
                </h3>
              </div>
              <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                {masterVoiceSummary(shortcuts.masterVoice, platform)}
              </span>
            </div>
            <div
              aria-label="Global master voice shortcut"
              className="grid gap-2 sm:grid-cols-3"
              role="radiogroup"
            >
              {masterVoiceOptions.map((option) => {
                const selected = shortcuts.masterVoice === option.value;
                return (
                  <button
                    aria-checked={selected}
                    className={cn(
                      "grid min-h-20 gap-2 rounded-sm border border-border bg-background/40 px-3 py-2 text-left outline-none transition-colors hover:border-primary/60 focus-visible:border-ring",
                      selected && "border-primary bg-primary/10",
                    )}
                    key={option.value}
                    onClick={() => onMasterVoiceChange(option.value)}
                    role="radio"
                    type="button"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-foreground">{option.label}</span>
                      <span
                        className={cn(
                          "flex h-4 w-4 items-center justify-center rounded-full border border-border",
                          selected && "border-primary bg-primary text-primary-foreground",
                        )}
                      >
                        {selected ? <Check className="h-3 w-3" /> : null}
                      </span>
                    </span>
                    <ShortcutChord value={masterVoiceShortcutParts(platform, option.value)} />
                  </button>
                );
              })}
            </div>
          </section>
          <ShortcutPreview workspaceNavigation={shortcuts.workspaceNavigation} />
        </>
      ) : (
        <div className="flex h-16 items-center gap-2 rounded-sm border border-border px-3 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading shortcut settings
        </div>
      )}
    </form>
  );
}

function ShortcutPreview({
  workspaceNavigation,
}: {
  workspaceNavigation: AppearanceWorkspaceNavigationShortcut;
}) {
  const rows = [
    { action: "Focus pane", chord: focusShortcutLabel(workspaceNavigation) },
    { action: "Move pane", chord: moveShortcutLabel(workspaceNavigation) },
    { action: "Split plane below", chord: planeSplitShortcutLabel(workspaceNavigation, false) },
    { action: "Split plane above", chord: planeSplitShortcutLabel(workspaceNavigation, true) },
  ];
  return (
    <section className="grid gap-1 rounded-sm border border-border bg-card/30 px-3 py-2.5">
      <h3 className="mb-1 truncate text-xs font-semibold text-foreground">Workspace Actions</h3>
      {rows.map((row) => (
        <div
          className="grid min-h-8 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-border/60 first:border-t-0"
          key={row.action}
        >
          <span className="truncate text-xs text-muted-foreground">{row.action}</span>
          <ShortcutChord value={row.chord} />
        </div>
      ))}
    </section>
  );
}

function ShortcutChord({ value }: { value: string[] }) {
  return (
    <span className="flex flex-wrap justify-end gap-1">
      {value.map((part) => (
        <kbd
          className="rounded-sm border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground"
          key={part}
        >
          {part}
        </kbd>
      ))}
    </span>
  );
}

function ShortcutSettingsStatus({
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
        Saving shortcut settings
      </div>
    );
  }
  if (dirty) {
    return <div className="text-xs text-muted-foreground">Unsaved shortcut changes</div>;
  }
  if (status === "ready") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Check className="h-3.5 w-3.5" />
        Shortcut settings saved
      </div>
    );
  }
  return null;
}

function workspaceNavigationSummary(value: AppearanceWorkspaceNavigationShortcut) {
  switch (value) {
    case "mod_alt_arrows":
      return "Mod + Alt";
    case "ctrl_alt_arrows":
      return "Ctrl + Alt";
    default:
      assertNever(value);
  }
}

function masterVoiceSummary(value: AppearanceMasterVoiceShortcut, platform: DesktopPlatform) {
  return masterVoiceShortcutParts(platform, value).join(" + ");
}

function focusShortcutLabel(value: AppearanceWorkspaceNavigationShortcut): string[] {
  switch (value) {
    case "mod_alt_arrows":
      return ["Mod", "Alt", "Arrow"];
    case "ctrl_alt_arrows":
      return ["Ctrl", "Alt", "Arrow"];
    default:
      assertNever(value);
  }
}

function moveShortcutLabel(value: AppearanceWorkspaceNavigationShortcut): string[] {
  switch (value) {
    case "mod_alt_arrows":
      return ["Mod", "Alt", "Shift", "Arrow"];
    case "ctrl_alt_arrows":
      return ["Ctrl", "Alt", "Shift", "Arrow"];
    default:
      assertNever(value);
  }
}

function planeSplitShortcutLabel(
  value: AppearanceWorkspaceNavigationShortcut,
  upward: boolean,
): string[] {
  const base = value === "ctrl_alt_arrows" ? ["Ctrl", "Alt"] : ["Mod", "Alt"];
  return upward ? [...base, "Shift", "Enter"] : [...base, "Enter"];
}

function assertNever(value: never): never {
  throw new Error(`Unsupported workspace navigation shortcut: ${String(value)}`);
}
