import type {
  AppearanceColorMode,
  AppearanceColorScheme,
  AppearanceFontScheme,
  AppearancePreset,
  AppearancePresetID,
  AppearanceSettings,
  AppearanceTailwindPalette,
} from "@generated/backend";
import {
  Check,
  ChevronDown,
  CircleAlert,
  Gauge,
  KeyRound,
  Keyboard,
  Loader2,
  Moon,
  Palette,
  RotateCcw,
  Save,
  Sun,
  Terminal,
  Type,
} from "lucide-react";
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  isHexColor,
  seedPalettePreview,
  seedPreviewStops,
  settingsFromSeed,
} from "./appearance-seed-palette";
import { CodexAccountSettings } from "./codex-account-settings";
import { DeveloperSettingsEditor } from "./developer-settings";
import { FloatingMenu } from "./floating-menu";
import { ShortcutSettingsEditor } from "./shortcut-settings";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { TerminalProfilesSettings } from "./terminal-profiles-settings";
import { cn } from "../lib/utils";
import {
  appearanceSettingsEqual,
  type AppearanceColorGroup,
  type AppearanceStoreStatus,
  useAppearanceStore,
} from "../stores/appearance-store";

type AppearanceColorValues = AppearanceColorScheme[AppearanceColorGroup];
type SettingsSubtab = "theme" | "shortcuts" | "developer" | "codex-account" | "terminal-profiles";
const settingsSubtabs = [
  { Icon: Palette, id: "theme", label: "Theme" },
  { Icon: Keyboard, id: "shortcuts", label: "Shortcuts" },
  { Icon: Gauge, id: "developer", label: "Developer" },
  { Icon: KeyRound, id: "codex-account", label: "Codex Account" },
  { Icon: Terminal, id: "terminal-profiles", label: "Terminal Profiles" },
] as const satisfies Array<{
  Icon: typeof Palette;
  id: SettingsSubtab;
  label: string;
}>;

export function SettingsPanel() {
  const [activeSubtab, setActiveSubtab] = useState<SettingsSubtab>("theme");
  const load = useAppearanceStore((state) => state.load);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section
      className="flex h-full min-h-0 flex-col bg-popover text-foreground"
      data-testid="settings-panel"
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div className="mx-auto grid w-full max-w-4xl gap-3">
          <SettingsSubtabList activeSubtab={activeSubtab} onChange={setActiveSubtab} />
          <SettingsSubtabContent activeSubtab={activeSubtab} />
        </div>
      </div>
    </section>
  );
}

function SettingsSubtabContent({ activeSubtab }: { activeSubtab: SettingsSubtab }) {
  const applyDraftSettings = useAppearanceStore((state) => state.applyDraftSettings);
  const defaultPresetId = useAppearanceStore((state) => state.defaultPresetId);
  const draft = useAppearanceStore((state) => state.draft);
  const error = useAppearanceStore((state) => state.error);
  const presets = useAppearanceStore((state) => state.presets);
  const revertDraft = useAppearanceStore((state) => state.revertDraft);
  const saveDraft = useAppearanceStore((state) => state.saveDraft);
  const settings = useAppearanceStore((state) => state.settings);
  const setColorValue = useAppearanceStore((state) => state.setColorValue);
  const setFontValue = useAppearanceStore((state) => state.setFontValue);
  const setClampResizedPanesToViewport = useAppearanceStore(
    (state) => state.setClampResizedPanesToViewport,
  );
  const setMode = useAppearanceStore((state) => state.setMode);
  const setOverviewCardWidthBounds = useAppearanceStore(
    (state) => state.setOverviewCardWidthBounds,
  );
  const setShowPerformanceStats = useAppearanceStore((state) => state.setShowPerformanceStats);
  const setWorkspaceNavigationShortcut = useAppearanceStore(
    (state) => state.setWorkspaceNavigationShortcut,
  );
  const status = useAppearanceStore((state) => state.status);
  const dirty = draft !== null && !appearanceSettingsEqual(draft, settings);
  const contentBySubtab = {
    "codex-account": <CodexAccountSettings />,
    developer: (
      <DeveloperSettingsEditor
        developer={draft?.developer ?? null}
        dirty={dirty}
        error={error}
        onClampResizedPanesToViewportChange={setClampResizedPanesToViewport}
        onOverviewCardWidthBoundsChange={setOverviewCardWidthBounds}
        onRevert={revertDraft}
        onSave={saveDraft}
        onShowPerformanceStatsChange={setShowPerformanceStats}
        status={status}
      />
    ),
    shortcuts: (
      <ShortcutSettingsEditor
        dirty={dirty}
        error={error}
        onRevert={revertDraft}
        onSave={saveDraft}
        onWorkspaceNavigationChange={setWorkspaceNavigationShortcut}
        shortcuts={draft?.shortcuts ?? null}
        status={status}
      />
    ),
    "terminal-profiles": <TerminalProfilesSettings />,
    theme: (
      <AppearanceSettingsEditor
        defaultPresetId={defaultPresetId}
        dirty={dirty}
        error={error}
        onApplySettings={applyDraftSettings}
        onColorChange={setColorValue}
        onFontChange={setFontValue}
        onModeChange={setMode}
        onRevert={revertDraft}
        onSave={saveDraft}
        presets={presets}
        settings={draft}
        status={status}
      />
    ),
  } satisfies Record<SettingsSubtab, ReactNode>;

  return (
    <SettingsSubtabPanel tab={activeSubtab}>{contentBySubtab[activeSubtab]}</SettingsSubtabPanel>
  );
}

function SettingsSubtabPanel({ children, tab }: { children: ReactNode; tab: SettingsSubtab }) {
  return (
    <div
      aria-labelledby={settingsSubtabButtonId(tab)}
      id={settingsSubtabPanelId(tab)}
      role="tabpanel"
    >
      {children}
    </div>
  );
}

function SettingsSubtabList({
  activeSubtab,
  onChange,
}: {
  activeSubtab: SettingsSubtab;
  onChange: (tab: SettingsSubtab) => void;
}) {
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tab: SettingsSubtab) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    event.preventDefault();
    const currentIndex = settingsSubtabs.findIndex((item) => item.id === tab);
    const offset = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (currentIndex + offset + settingsSubtabs.length) % settingsSubtabs.length;
    const nextTab = settingsSubtabs[nextIndex];
    if (!nextTab) {
      return;
    }
    onChange(nextTab.id);
    const tabs =
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    tabs?.[nextIndex]?.focus();
  };

  return (
    <div
      aria-label="Settings sections"
      className="inline-flex w-fit max-w-full items-center gap-1 rounded-sm bg-muted p-1"
      role="tablist"
    >
      {settingsSubtabs.map(({ Icon, id, label }) => {
        const active = activeSubtab === id;
        return (
          <button
            aria-controls={settingsSubtabPanelId(id)}
            aria-selected={active}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:bg-accent",
              active && "bg-card text-card-foreground shadow-sm",
            )}
            id={settingsSubtabButtonId(id)}
            key={id}
            onClick={() => onChange(id)}
            onKeyDown={(event) => handleKeyDown(event, id)}
            role="tab"
            tabIndex={active ? 0 : -1}
            type="button"
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

function settingsSubtabButtonId(tab: SettingsSubtab) {
  return `settings-subtab-${tab}`;
}

function settingsSubtabPanelId(tab: SettingsSubtab) {
  return `settings-subtab-panel-${tab}`;
}

interface AppearanceSettingsEditorProps {
  defaultPresetId: AppearancePresetID | null;
  dirty: boolean;
  error: string | null;
  onApplySettings: (settings: AppearanceSettings) => void;
  onColorChange: (
    mode: AppearanceColorMode,
    group: AppearanceColorGroup,
    name: string,
    value: string,
  ) => void;
  onFontChange: (name: keyof AppearanceFontScheme, value: string) => void;
  onModeChange: (mode: AppearanceColorMode) => void;
  onRevert: () => void;
  onSave: () => Promise<void>;
  presets: AppearancePreset[];
  settings: AppearanceSettings | null;
  status: AppearanceStoreStatus;
}

export function AppearanceSettingsEditor({
  defaultPresetId,
  dirty,
  error,
  onApplySettings,
  onColorChange,
  onFontChange,
  onModeChange,
  onRevert,
  onSave,
  presets,
  settings,
  status,
}: AppearanceSettingsEditorProps) {
  const busy = status === "loading" || status === "saving";

  return (
    <form
      className="grid gap-3"
      data-testid="appearance-settings"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave();
      }}
    >
      <header className="grid gap-2">
        <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Palette className="h-4 w-4 shrink-0 text-muted-foreground" />
            <h2 className="truncate text-xs font-semibold tracking-wide text-foreground">Theme</h2>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
            {settings ? <ModeSwitch mode={settings.mode} onChange={onModeChange} /> : null}
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
        </div>
        <AppearanceStatus status={status} dirty={dirty} error={error} />
      </header>
      {settings ? (
        <>
          <PalettePresetChooser
            defaultPresetId={defaultPresetId}
            onApplySettings={onApplySettings}
            presets={presets}
            settings={settings}
          />
          <SeedPaletteSection onApplySettings={onApplySettings} settings={settings} />
          <StatusColorSection
            mode={settings.mode}
            onChange={onColorChange}
            status={settings[settings.mode].status}
          />
          <AccordionSection
            count={Object.keys(settings.fonts).length}
            title="Fonts"
            icon={<Type className="h-4 w-4 text-muted-foreground" />}
          >
            <FontFields fonts={settings.fonts} onChange={onFontChange} />
          </AccordionSection>
          <ColorSchemeFields
            mode={settings.mode}
            scheme={settings[settings.mode]}
            onChange={onColorChange}
          />
        </>
      ) : (
        <div className="flex h-16 items-center gap-2 rounded-sm border border-border px-3 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading theme settings
        </div>
      )}
    </form>
  );
}

function AppearanceStatus({
  dirty,
  error,
  label = "theme",
  status,
}: {
  dirty: boolean;
  error: string | null;
  label?: "developer" | "theme";
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
        Saving {label} settings
      </div>
    );
  }
  if (dirty) {
    return <div className="text-xs text-muted-foreground">Unsaved {label} changes</div>;
  }
  if (status === "ready") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Check className="h-3.5 w-3.5" />
        {label === "theme" ? "Theme" : "Developer"} settings saved
      </div>
    );
  }
  return null;
}

function PalettePresetChooser({
  defaultPresetId,
  onApplySettings,
  presets,
  settings,
}: {
  defaultPresetId: AppearancePresetID | null;
  onApplySettings: (settings: AppearanceSettings) => void;
  presets: AppearancePreset[];
  settings: AppearanceSettings;
}) {
  const groups = useMemo(() => groupAppearancePresets(presets), [presets]);
  const activePreset = useMemo(
    () => presets.find((preset) => presetMatchesSettings(preset, settings)) ?? null,
    [presets, settings],
  );
  const activePreview = useMemo(
    () => presetPreviewValues((activePreset?.settings ?? settings)[settings.mode].tailwind),
    [activePreset, settings],
  );
  const [open, setOpen] = useState(false);
  const listboxId = useId();
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const activeIsDefault = activePreset?.id === defaultPresetId;

  useEffect(() => {
    if (!open) {
      return;
    }
    const ownerDocument = anchorRef.current?.ownerDocument ?? document;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (anchorRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        anchorRef.current?.focus();
      }
    };
    ownerDocument.addEventListener("pointerdown", handlePointerDown);
    ownerDocument.addEventListener("keydown", handleKeyDown);
    return () => {
      ownerDocument.removeEventListener("pointerdown", handlePointerDown);
      ownerDocument.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const openMenu = () => {
    setOpen(true);
    requestPresetOptionFocus(anchorRef.current, () => menuRef.current);
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    openMenu();
  };

  return (
    <section className="rounded-sm border border-border bg-card/30 px-3 py-2.5">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(17rem,24rem)] sm:items-center">
        <div className="flex min-h-7 min-w-0 items-center justify-between gap-3 sm:justify-start">
          <h3 className="truncate text-xs font-semibold text-foreground">Color Presets</h3>
          <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
            {presets.length} options
          </span>
        </div>
        <Button
          aria-controls={listboxId}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label="Color preset"
          className="h-8 w-full justify-between px-2.5"
          onClick={() => {
            if (open) {
              setOpen(false);
              return;
            }
            openMenu();
          }}
          onKeyDown={handleTriggerKeyDown}
          ref={anchorRef}
          role="combobox"
          type="button"
        >
          <span className="flex min-w-0 items-center gap-2">
            <PresetSwatches className="w-16 shrink-0" values={activePreview} />
            <span className="min-w-0 truncate">
              {activePreset ? activePreset.name : "Custom colors"}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            {activeIsDefault ? (
              <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                Default
              </span>
            ) : null}
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 text-muted-foreground transition-transform",
                open && "rotate-180",
              )}
            />
          </span>
        </Button>
      </div>
      <FloatingMenu
        anchorRef={anchorRef}
        ariaLabel="Color presets"
        className="max-h-80 overflow-y-auto rounded-sm border border-border bg-popover p-1 shadow-xl"
        id={listboxId}
        matchAnchorWidth
        menuRef={menuRef}
        open={open}
        role="listbox"
      >
        {groups.map((group) => (
          <div className="grid gap-1 py-1" key={group.title}>
            <div className="flex items-center justify-between gap-2 px-2 py-1">
              <span className="truncate text-[10px] font-semibold uppercase text-muted-foreground">
                {group.title}
              </span>
              <span className="text-[10px] text-muted-foreground">{group.presets.length}</span>
            </div>
            {group.presets.map((preset) => {
              const active = presetMatchesSettings(preset, settings);
              const isDefault = preset.id === defaultPresetId;
              return (
                <button
                  aria-selected={active}
                  className={cn(
                    "grid w-full grid-cols-[1rem_minmax(0,1fr)_4rem] items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground",
                    active && "bg-accent text-accent-foreground",
                  )}
                  key={preset.id}
                  onClick={() => {
                    onApplySettings({
                      ...preset.settings,
                      developer: settings.developer,
                      mode: settings.mode,
                      shortcuts: settings.shortcuts,
                    });
                    setOpen(false);
                    anchorRef.current?.focus();
                  }}
                  onKeyDown={handlePresetOptionKeyDown}
                  role="option"
                  type="button"
                >
                  <span className="flex h-4 w-4 items-center justify-center">
                    {active ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
                  </span>
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="min-w-0 truncate font-medium">{preset.name}</span>
                    {isDefault ? (
                      <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        Default
                      </span>
                    ) : null}
                  </span>
                  <PresetSwatches
                    className="h-3.5 w-16"
                    values={presetPreviewValues(preset.settings[settings.mode].tailwind)}
                  />
                </button>
              );
            })}
          </div>
        ))}
      </FloatingMenu>
    </section>
  );
}

function PresetSwatches({ className, values }: { className?: string; values: string[] }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid h-4 grid-cols-9 overflow-hidden rounded-sm border border-border",
        className,
      )}
    >
      {values.map((value, index) => (
        <span className="min-w-0" key={`${value}-${index}`} style={{ backgroundColor: value }} />
      ))}
    </span>
  );
}

function presetMatchesSettings(preset: AppearancePreset, settings: AppearanceSettings) {
  return appearanceSettingsEqual(
    {
      ...preset.settings,
      developer: settings.developer,
      mode: settings.mode,
      shortcuts: settings.shortcuts,
    },
    settings,
  );
}

function requestPresetOptionFocus(anchor: HTMLElement | null, menu: () => HTMLElement | null) {
  const view = anchor?.ownerDocument.defaultView ?? menu()?.ownerDocument.defaultView;
  view?.requestAnimationFrame(() => {
    const listbox = menu();
    const selected = listbox?.querySelector<HTMLButtonElement>(
      '[role="option"][aria-selected="true"]',
    );
    const first = listbox?.querySelector<HTMLButtonElement>('[role="option"]');
    (selected ?? first)?.focus();
  });
}

function handlePresetOptionKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    focusPresetOption(event.currentTarget, 1);
    return;
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    focusPresetOption(event.currentTarget, -1);
    return;
  }
  if (event.key === "Home") {
    event.preventDefault();
    focusPresetOption(event.currentTarget, "first");
    return;
  }
  if (event.key === "End") {
    event.preventDefault();
    focusPresetOption(event.currentTarget, "last");
  }
}

function focusPresetOption(currentOption: HTMLButtonElement, target: number | "first" | "last") {
  const menu = currentOption.closest('[role="listbox"]');
  if (!menu) {
    return;
  }
  const options = Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="option"]'));
  if (options.length === 0) {
    return;
  }
  if (target === "first") {
    options[0]?.focus();
    return;
  }
  if (target === "last") {
    options[options.length - 1]?.focus();
    return;
  }
  const currentIndex = options.indexOf(currentOption);
  const nextIndex = (currentIndex + target + options.length) % options.length;
  options[nextIndex]?.focus();
}

function SeedPaletteSection({
  onApplySettings,
  settings,
}: {
  onApplySettings: (settings: AppearanceSettings) => void;
  settings: AppearanceSettings;
}) {
  const [seedColor, setSeedColor] = useState("#4ce2ff");
  const seedIsValid = isHexColor(seedColor);
  const seedSettings = useMemo(
    () => (seedIsValid ? settingsFromSeed(settings, seedColor) : null),
    [seedColor, seedIsValid, settings],
  );
  const seedPreview = useMemo(
    () => (seedIsValid ? seedPalettePreview(seedColor) : []),
    [seedColor, seedIsValid],
  );

  return (
    <AccordionSection count={seedPreviewStops.length} title="Custom Seed Palette">
      <div className="grid gap-2">
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1">
            <span className="text-[11px] font-medium text-muted-foreground">Seed color</span>
            <span className="flex items-center gap-2">
              <input
                aria-label="Custom seed color"
                className="h-7 w-9 rounded-sm border border-input bg-card p-1"
                onChange={(event) => setSeedColor(event.target.value)}
                type="color"
                value={seedIsValid ? seedColor : "#5b6f95"}
              />
              <Input
                className="w-28 font-mono uppercase"
                onChange={(event) => setSeedColor(event.target.value)}
                spellCheck={false}
                value={seedColor}
              />
            </span>
          </label>
          <Button
            disabled={!seedSettings}
            onClick={() => {
              if (seedSettings) {
                onApplySettings(seedSettings);
              }
            }}
            type="button"
          >
            Use Seed
          </Button>
        </div>
        {seedIsValid ? (
          <div className="grid grid-cols-9 overflow-hidden rounded-sm border border-border">
            {seedPreview.map((value, index) => (
              <span
                aria-hidden="true"
                className="h-5"
                key={`${value}-${index}`}
                style={{ backgroundColor: value }}
              />
            ))}
          </div>
        ) : (
          <div className="text-[11px] text-status-warning">Use a #RRGGBB seed color.</div>
        )}
      </div>
    </AccordionSection>
  );
}

function ModeSwitch({
  mode,
  onChange,
}: {
  mode: AppearanceColorMode;
  onChange: (mode: AppearanceColorMode) => void;
}) {
  return (
    <div
      aria-label="Color scheme"
      className="grid grid-cols-2 gap-1 rounded-sm border border-border bg-muted p-1"
      role="group"
    >
      {colorModes.map(({ Icon, label, value }) => (
        <button
          aria-pressed={mode === value}
          className={cn(
            "flex h-7 min-w-16 items-center justify-center gap-1.5 rounded-sm px-2 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:bg-accent",
            mode === value && "bg-card text-card-foreground shadow-sm",
          )}
          key={value}
          onClick={() => onChange(value)}
          title={`${label} mode`}
          type="button"
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}

function FontFields({
  fonts,
  onChange,
}: {
  fonts: AppearanceFontScheme;
  onChange: (name: keyof AppearanceFontScheme, value: string) => void;
}) {
  return (
    <div className="grid gap-2">
      {(Object.entries(fonts) as Array<[keyof AppearanceFontScheme, string]>).map(
        ([name, value]) => (
          <label className="grid gap-1" key={name}>
            <span className="text-[11px] font-medium text-muted-foreground">
              {fieldLabel(name)}
            </span>
            <Input
              className="font-mono"
              onChange={(event) => onChange(name, event.target.value)}
              spellCheck={false}
              value={value}
            />
          </label>
        ),
      )}
    </div>
  );
}

function StatusColorFields({
  mode,
  onChange,
  status,
}: {
  mode: AppearanceColorMode;
  onChange: (
    mode: AppearanceColorMode,
    group: AppearanceColorGroup,
    name: string,
    value: string,
  ) => void;
  status: AppearanceColorScheme["status"];
}) {
  return <ColorFieldGrid group="status" mode={mode} onChange={onChange} values={status} />;
}

function StatusColorSection({
  mode,
  onChange,
  status,
}: {
  mode: AppearanceColorMode;
  onChange: (
    mode: AppearanceColorMode,
    group: AppearanceColorGroup,
    name: string,
    value: string,
  ) => void;
  status: AppearanceColorScheme["status"];
}) {
  return (
    <section className="grid gap-2 rounded-sm border border-border bg-card/30 p-3">
      <div className="flex min-h-7 items-center justify-between gap-3">
        <h3 className="text-xs font-semibold text-foreground">Status Colors</h3>
        <span className="text-[11px] font-medium text-muted-foreground">
          {Object.keys(status).length} values
        </span>
      </div>
      <StatusColorFields mode={mode} onChange={onChange} status={status} />
    </section>
  );
}

function ColorSchemeFields({
  mode,
  onChange,
  scheme,
}: {
  mode: AppearanceColorMode;
  onChange: (
    mode: AppearanceColorMode,
    group: AppearanceColorGroup,
    name: string,
    value: string,
  ) => void;
  scheme: AppearanceColorScheme;
}) {
  const advancedColorCount =
    Object.keys(scheme.tailwind).length +
    Object.keys(scheme.shadcn).length +
    Object.keys(scheme.accent).length;

  return (
    <AccordionSection count={advancedColorCount} title="Advanced Color Tokens">
      <section className="grid gap-2">
        {(["tailwind", "shadcn", "accent"] as const).map((group) => {
          const values = scheme[group];
          return (
            <AccordionSection
              count={Object.keys(values).length}
              key={group}
              title={colorGroupLabels[group]}
            >
              <ColorFieldGrid group={group} mode={mode} onChange={onChange} values={values} />
            </AccordionSection>
          );
        })}
      </section>
    </AccordionSection>
  );
}

function AccordionSection({
  children,
  count,
  icon,
  title,
}: {
  children: ReactNode;
  count: number;
  icon?: ReactNode;
  title: string;
}) {
  return (
    <details className="group rounded-sm border border-border bg-card/30">
      <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 px-3 text-xs font-semibold text-foreground [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-2">
          {icon}
          <span className="truncate">{title}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-[11px] font-medium text-muted-foreground">
          {count} values
          <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className="border-t border-border p-3">{children}</div>
    </details>
  );
}

function ColorFieldGrid({
  group,
  mode,
  onChange,
  values,
}: {
  group: AppearanceColorGroup;
  mode: AppearanceColorMode;
  onChange: (
    mode: AppearanceColorMode,
    group: AppearanceColorGroup,
    name: string,
    value: string,
  ) => void;
  values: AppearanceColorValues;
}) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {Object.entries(values).map(([name, value]) => (
        <label className="grid min-w-0 gap-1" key={name}>
          <span className="text-[11px] font-medium text-muted-foreground">{fieldLabel(name)}</span>
          <span className="grid min-w-0 grid-cols-[1.25rem_minmax(0,1fr)] items-center gap-2">
            <span
              aria-hidden="true"
              className="h-5 w-5 rounded-sm border border-border"
              style={{ backgroundColor: value }}
            />
            <Input
              className="font-mono"
              onChange={(event) => onChange(mode, group, name, event.target.value)}
              spellCheck={false}
              value={value}
            />
          </span>
        </label>
      ))}
    </div>
  );
}

const colorModes = [
  { Icon: Moon, label: "Dark", value: "dark" },
  { Icon: Sun, label: "Light", value: "light" },
] as const satisfies Array<{
  Icon: typeof Moon;
  label: string;
  value: AppearanceColorMode;
}>;

const colorGroupLabels = {
  accent: "Accent Colors",
  shadcn: "shadcn/ui Tokens",
  status: "Status Colors",
  tailwind: "Palette Scale",
} as const satisfies Record<AppearanceColorGroup, string>;

interface AppearancePresetGroup {
  title: string;
  presets: AppearancePreset[];
}

function groupAppearancePresets(presets: AppearancePreset[]): AppearancePresetGroup[] {
  const setta = presets.filter((preset) => preset.id === "setta_standard");
  const tailwind = presets.filter((preset) => preset.id.startsWith("tailwind_"));
  const shadcn = presets.filter((preset) => preset.id.startsWith("shadcn_"));
  const other = presets.filter(
    (preset) =>
      preset.id !== "setta_standard" &&
      !preset.id.startsWith("tailwind_") &&
      !preset.id.startsWith("shadcn_"),
  );
  return [
    { presets: setta, title: "Setta" },
    { presets: tailwind, title: "Tailwind 4" },
    { presets: shadcn, title: "shadcn/ui" },
    { presets: other, title: "Other" },
  ].filter((group) => group.presets.length > 0);
}

function presetPreviewValues(tailwind: AppearanceTailwindPalette): string[] {
  return seedPreviewStops.map((name) => tailwind[name]);
}

function fieldLabel(name: string) {
  return name
    .replace(/^setta(\d+)$/, "setta $1")
    .replace(/[A-Z]/g, (match) => ` ${match.toLowerCase()}`)
    .replace(/^\w/, (match) => match.toUpperCase());
}
