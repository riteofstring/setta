import type {
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
  Loader2,
  Palette,
  RotateCcw,
  Save,
  Server,
  Type,
} from "lucide-react";
import {
  type Dispatch,
  type KeyboardEvent,
  type ReactNode,
  type SetStateAction,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  isOKLCHColor,
  seedPalettePreview,
  seedPreviewStops,
  settingsFromSeed,
} from "./appearance-seed-palette";
import { CodexAccountSettings } from "./codex-account-settings";
import { FloatingMenu } from "./floating-menu";
import { RoleConfigurationSettings } from "./role-configuration-settings";
import { RuntimePicker, RuntimePickerAddButton } from "./runtime-picker";
import {
  AccordionSection,
  ColorSchemeFields,
  fieldLabel,
  OKLCHSeedPicker,
  StatusColorSection,
} from "./settings-panel-color-fields";
import { settingsSubtabs, type SettingsSubtab } from "./settings-subtabs";
import { SettaCompactInput } from "./setta-compact-input";
import { Button } from "./ui/button";
import { VoiceConfigurationSettings } from "./voice-configuration-settings";
import { cn } from "../lib/utils";
import {
  appearanceSettingsEqual,
  type AppearanceColorGroup,
  type AppearanceStoreStatus,
  useAppearanceStore,
} from "../stores/appearance-store";
import {
  type SettingsFocusRequest,
  type SettingsShellRoute,
  useSettingsNavigationStore,
} from "../stores/settings-navigation-store";

export function SettingsPanel() {
  const load = useAppearanceStore((state) => state.load);
  const lastSubtab = useSettingsNavigationStore((state) => state.lastSubtab);
  const route = useSettingsNavigationStore((state) => state.route);
  const setActiveSubtab = useSettingsNavigationStore((state) => state.setActiveSubtab);
  const activeSubtab = settingsPanelActiveSubtab(route, lastSubtab);
  const [runtimePairingOpen, setRuntimePairingOpen] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  const focusRequest =
    route.page === "settings" && route.focusTarget && route.subtab === activeSubtab
      ? {
          requestId: route.requestId,
          target: route.focusTarget,
        }
      : null;

  return (
    <section
      className="flex h-full min-h-0 flex-col bg-transparent text-foreground"
      data-testid="settings-panel"
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div className="mx-auto grid w-full max-w-4xl gap-3">
          <RuntimeSettingsPanel adding={runtimePairingOpen} setAdding={setRuntimePairingOpen} />
          <SettingsSubtabList activeSubtab={activeSubtab} onChange={setActiveSubtab} />
          <SettingsSubtabContent activeSubtab={activeSubtab} focusRequest={focusRequest} />
        </div>
      </div>
    </section>
  );
}

function RuntimeSettingsPanel({
  adding,
  setAdding,
}: {
  adding: boolean;
  setAdding: Dispatch<SetStateAction<boolean>>;
}) {
  return (
    <section
      aria-labelledby="settings-runtime-title"
      className="grid gap-2 rounded-sm border border-border bg-card/30 px-3 py-2.5"
      data-testid="settings-runtime-picker"
    >
      <header className="flex min-h-7 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Server className="h-4 w-4 shrink-0 text-muted-foreground" />
          <h2
            className="truncate text-xs font-semibold tracking-wide text-foreground"
            id="settings-runtime-title"
          >
            Runtime
          </h2>
        </div>
        <RuntimePickerAddButton adding={adding} setAdding={setAdding} />
      </header>
      <RuntimePicker adding={adding} setAdding={setAdding} />
    </section>
  );
}

function settingsPanelActiveSubtab(
  route: SettingsShellRoute,
  lastSubtab: SettingsSubtab,
): SettingsSubtab {
  return route.page === "settings" ? route.subtab : lastSubtab;
}

function SettingsSubtabContent({
  activeSubtab,
  focusRequest,
}: {
  activeSubtab: SettingsSubtab;
  focusRequest: SettingsFocusRequest | null;
}) {
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
  const status = useAppearanceStore((state) => state.status);
  const dirty = draft !== null && !appearanceSettingsEqual(draft, settings);
  const contentBySubtab = {
    "codex-account": <CodexAccountSettings />,
    roles: <RoleConfigurationSettings />,
    speech: <VoiceConfigurationSettings focusRequest={focusRequest} />,
    theme: (
      <AppearanceSettingsEditor
        defaultPresetId={defaultPresetId}
        dirty={dirty}
        error={error}
        onApplySettings={applyDraftSettings}
        onColorChange={setColorValue}
        onFontChange={setFontValue}
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
      className="inline-flex w-fit max-w-full flex-wrap items-center gap-1 rounded-sm bg-muted p-1"
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
  onColorChange: (group: AppearanceColorGroup, name: string, value: string) => void;
  onFontChange: (name: keyof AppearanceFontScheme, value: string) => void;
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
            <Button
              disabled={!dirty || busy}
              onClick={onRevert}
              size="sm"
              type="button"
              variant="outline"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Revert
            </Button>
            <Button disabled={!dirty || busy} size="sm" type="submit">
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
            onChange={onColorChange}
            status={settings.dark.status}
            tailwind={settings.dark.tailwind}
          />
          <AccordionSection
            count={Object.keys(settings.fonts).length}
            title="Fonts"
            icon={<Type className="h-4 w-4 text-muted-foreground" />}
          >
            <FontFields fonts={settings.fonts} onChange={onFontChange} />
          </AccordionSection>
          <ColorSchemeFields scheme={settings.dark} onChange={onColorChange} />
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
        Saving theme settings
      </div>
    );
  }
  if (dirty) {
    return <div className="text-xs text-muted-foreground">Unsaved theme changes</div>;
  }
  if (status === "ready") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Check className="h-3.5 w-3.5" />
        Theme settings saved
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
    () => presetPreviewValues((activePreset?.settings ?? settings).dark.tailwind),
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
          className="w-full justify-between"
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
          variant="outline"
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
                    values={presetPreviewValues(preset.settings.dark.tailwind)}
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
  const [seedColor, setSeedColor] = useState("oklch(0.8460 0.1292 213.38)");
  const seedIsValid = isOKLCHColor(seedColor);
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
        <div className="grid gap-2">
          <label className="grid gap-1">
            <span className="text-[11px] font-medium text-muted-foreground">Seed color</span>
            <SettaCompactInput
              aria-label="Custom OKLCH seed color"
              className="font-mono"
              onChange={(event) => setSeedColor(event.target.value)}
              spellCheck={false}
              value={seedColor}
            />
          </label>
          <OKLCHSeedPicker value={seedColor} onChange={setSeedColor} />
          <Button
            className="w-fit"
            disabled={!seedSettings}
            onClick={() => {
              if (seedSettings) {
                onApplySettings(seedSettings);
              }
            }}
            size="sm"
            type="button"
            variant="outline"
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
          <div className="text-[11px] text-status-warning">
            Use an OKLCH seed color like oklch(0.8460 0.1292 213.38).
          </div>
        )}
      </div>
    </AccordionSection>
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
            <SettaCompactInput
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
