import type {
  ProfileCWDMode,
  ProfileLaunchMode,
  TerminalProfile,
  TerminalProfileInput,
  TerminalProfileList,
  ThemeID,
} from "@generated/backend";
import { Copy, Plus, Save, Star, Terminal, Trash2 } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import { terminalThemeOptions } from "../niri-workspace/terminal-display-settings";
import {
  dispatchTerminalProfilesChanged,
  terminalProfileInput,
} from "../niri-workspace/terminal-profiles";

export function TerminalProfilesSettings() {
  const model = useTerminalProfilesSettings();
  return <TerminalProfilesSettingsView model={model} />;
}

function useTerminalProfilesSettings(): TerminalProfilesSettingsModel {
  const [argsText, setArgsText] = useState("");
  const [envText, setEnvText] = useState("");
  const [error, setError] = useState("");
  const [profiles, setProfiles] = useState<TerminalProfileList | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<TerminalProfileInput | null>(null);
  const selectedProfile = useMemo(
    () => profiles?.profiles.find((profile) => profile.id === selectedId) ?? null,
    [profiles, selectedId],
  );
  const capabilities = terminalProfileCapabilities(profiles, selectedProfile, draft);

  useEffect(() => {
    let cancelled = false;
    const api = window.setta?.terminal;
    if (!api) {
      setError("Terminal profile API is unavailable.");
      return;
    }
    void api
      .listProfiles()
      .then((next) => {
        if (!cancelled) {
          applyProfileList(next);
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(errorText(loadError));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function applyProfileList(next: TerminalProfileList, preferredId = selectedId) {
    const editor = profileEditorState(next, preferredId);
    setProfiles(next);
    dispatchTerminalProfilesChanged(next);
    setSelectedId(editor.selectedId);
    setDraft(editor.draft);
    setArgsText(editor.argsText);
    setEnvText(editor.envText);
    setError("");
  }

  function selectProfile(id: string) {
    const editor = profileEditorState(profiles, id);
    setSelectedId(editor.selectedId);
    setDraft(editor.draft);
    setArgsText(editor.argsText);
    setEnvText(editor.envText);
    setError("");
  }

  function updateDraft(next: Partial<TerminalProfileInput>) {
    setDraft((current) => (current ? { ...current, ...next } : current));
  }

  async function saveProfile() {
    const api = window.setta?.terminal;
    if (!api || !draft || !selectedProfile) {
      return;
    }
    try {
      const profile = draftWithTextFields(draft, argsText, envText);
      applyProfileList(
        await api.updateProfile({ id: selectedProfile.id, profile }),
        selectedProfile.id,
      );
    } catch (saveError) {
      setError(errorText(saveError));
    }
  }

  async function createProfile(copyFrom: TerminalProfile | null) {
    const api = window.setta?.terminal;
    const profile = createProfileInput(copyFrom, selectedProfile, profiles);
    if (!api || !profile) {
      return;
    }
    try {
      const next = await api.createProfile({ profile });
      const created = newestProfile(next, profiles);
      applyProfileList(next, created?.id ?? next.defaultProfileId);
    } catch (createError) {
      setError(errorText(createError));
    }
  }

  async function deleteProfile() {
    const api = window.setta?.terminal;
    if (!api || !selectedProfile || selectedProfile.id === "default") {
      return;
    }
    try {
      applyProfileList(await api.deleteProfile({ id: selectedProfile.id }));
    } catch (deleteError) {
      setError(errorText(deleteError));
    }
  }

  async function makeDefaultProfile() {
    const api = window.setta?.terminal;
    if (!api || !selectedProfile) {
      return;
    }
    try {
      applyProfileList(
        await api.selectDefaultProfile({ id: selectedProfile.id }),
        selectedProfile.id,
      );
    } catch (defaultError) {
      setError(errorText(defaultError));
    }
  }

  return {
    argsText,
    capabilities,
    createProfile,
    deleteProfile,
    draft,
    envText,
    error,
    makeDefaultProfile,
    profiles,
    saveProfile,
    selectProfile,
    selectedId,
    selectedProfile,
    setArgsText,
    setEnvText,
    updateDraft,
  };
}

function TerminalProfilesSettingsView({ model }: { model: TerminalProfilesSettingsModel }) {
  const {
    argsText,
    capabilities,
    createProfile,
    deleteProfile,
    draft,
    envText,
    error,
    makeDefaultProfile,
    profiles,
    saveProfile,
    selectProfile,
    selectedId,
    selectedProfile,
    setArgsText,
    setEnvText,
    updateDraft,
  } = model;

  return (
    <section className="grid gap-3" data-testid="terminal-profiles-panel">
      <header className="flex h-8 items-center gap-2 text-muted-foreground">
        <Terminal className="h-4 w-4" />
        <h2 className="text-xs font-semibold tracking-wide text-foreground">Terminal Profiles</h2>
      </header>
      <div className="flex flex-wrap items-center gap-2">
        <select
          className={selectClassName}
          data-terminal-profile-field="profile"
          value={selectedId}
          onChange={(event) => selectProfile(event.currentTarget.value)}
        >
          {(profiles?.profiles ?? []).map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profileOptionLabel(profile, profiles?.defaultProfileId ?? "")}
            </option>
          ))}
        </select>
        <IconButton
          disabled={!capabilities.canCreateProfile}
          label="New profile"
          onClick={() => createProfile(null)}
        >
          <Plus className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton
          disabled={!capabilities.canDuplicateProfile}
          label="Duplicate profile"
          onClick={() => createProfile(selectedProfile)}
        >
          <Copy className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton
          disabled={!capabilities.canSaveProfile}
          label="Save profile"
          onClick={saveProfile}
        >
          <Save className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton
          disabled={!capabilities.canMakeDefaultProfile}
          label="Make default profile"
          onClick={makeDefaultProfile}
        >
          <Star className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton
          disabled={!capabilities.canDeleteProfile}
          label="Delete profile"
          onClick={deleteProfile}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </IconButton>
      </div>
      {error ? <div className="text-xs text-status-critical">{error}</div> : null}
      {draft ? (
        <div className="grid gap-3 rounded-sm border border-border bg-card/30 p-3 md:grid-cols-2">
          <label className={labelClassName}>
            Name
            <input
              className={inputClassName}
              data-terminal-profile-field="name"
              value={draft.name}
              onChange={(event) => updateDraft({ name: event.currentTarget.value })}
            />
          </label>
          <label className={labelClassName}>
            Launch
            <select
              className={selectClassName}
              data-terminal-profile-field="launchMode"
              value={draft.launchMode}
              onChange={(event) =>
                updateDraft({ launchMode: event.currentTarget.value as ProfileLaunchMode })
              }
            >
              <option value="shell">Shell</option>
              <option value="custom-command">Custom command</option>
            </select>
          </label>
          <label className={labelClassName}>
            Shell Path
            <input
              className={inputClassName}
              data-terminal-profile-field="shellPath"
              value={draft.shellPath}
              onChange={(event) => updateDraft({ shellPath: event.currentTarget.value })}
            />
          </label>
          <label className={labelClassName}>
            Detected Shell
            <select
              className={selectClassName}
              data-terminal-profile-field="detectedShell"
              value=""
              onChange={(event) => {
                const shell = profiles?.detectedShells.find(
                  (candidate) => candidate.path === event.currentTarget.value,
                );
                if (shell) {
                  updateDraft({ launchMode: shell.launchMode, shellPath: shell.path });
                }
              }}
            >
              <option value="">Choose</option>
              {(profiles?.detectedShells ?? []).map((shell) => (
                <option key={shell.id} value={shell.path}>
                  {shell.name}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClassName}>
            Cwd Mode
            <select
              className={selectClassName}
              data-terminal-profile-field="cwdMode"
              value={draft.cwdMode}
              onChange={(event) =>
                updateDraft({ cwdMode: event.currentTarget.value as ProfileCWDMode })
              }
            >
              <option value="project">Project</option>
              <option value="home">Home</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          <label className={labelClassName}>
            Custom Cwd
            <input
              className={inputClassName}
              data-terminal-profile-field="cwd"
              value={draft.cwd}
              onChange={(event) => updateDraft({ cwd: event.currentTarget.value })}
            />
          </label>
          <label className={labelClassName}>
            Theme
            <select
              className={selectClassName}
              data-terminal-profile-field="themeId"
              value={draft.themeId}
              onChange={(event) => updateDraft({ themeId: event.currentTarget.value as ThemeID })}
            >
              {terminalThemeOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClassName}>
            Font Size
            <input
              className={inputClassName}
              data-terminal-profile-field="fontSize"
              min={10}
              max={22}
              type="number"
              value={draft.fontSize}
              onChange={(event) => updateDraft({ fontSize: Number(event.currentTarget.value) })}
            />
          </label>
          <label className={labelClassName}>
            Font Family
            <input
              className={inputClassName}
              data-terminal-profile-field="fontFamily"
              value={draft.fontFamily}
              onChange={(event) => updateDraft({ fontFamily: event.currentTarget.value })}
            />
          </label>
          <label className={labelClassName}>
            Scrollback
            <input
              className={inputClassName}
              data-terminal-profile-field="scrollback"
              min={100}
              max={10000}
              step={100}
              type="number"
              value={draft.scrollback}
              onChange={(event) => updateDraft({ scrollback: Number(event.currentTarget.value) })}
            />
          </label>
          <label className={`${labelClassName} md:col-span-2`}>
            Args
            <textarea
              className={textareaClassName}
              data-terminal-profile-field="args"
              value={argsText}
              onChange={(event) => setArgsText(event.currentTarget.value)}
            />
          </label>
          <label className={`${labelClassName} md:col-span-2`}>
            Env
            <textarea
              className={textareaClassName}
              data-terminal-profile-field="env"
              value={envText}
              onChange={(event) => setEnvText(event.currentTarget.value)}
            />
          </label>
        </div>
      ) : null}
    </section>
  );
}

interface TerminalProfileCapabilities {
  canCreateProfile: boolean;
  canDeleteProfile: boolean;
  canDuplicateProfile: boolean;
  canMakeDefaultProfile: boolean;
  canSaveProfile: boolean;
}

interface TerminalProfilesSettingsModel {
  argsText: string;
  capabilities: TerminalProfileCapabilities;
  createProfile: (copyFrom: TerminalProfile | null) => Promise<void>;
  deleteProfile: () => Promise<void>;
  draft: TerminalProfileInput | null;
  envText: string;
  error: string;
  makeDefaultProfile: () => Promise<void>;
  profiles: TerminalProfileList | null;
  saveProfile: () => Promise<void>;
  selectProfile: (id: string) => void;
  selectedId: string;
  selectedProfile: TerminalProfile | null;
  setArgsText: (value: string) => void;
  setEnvText: (value: string) => void;
  updateDraft: (next: Partial<TerminalProfileInput>) => void;
}

function terminalProfileCapabilities(
  profiles: TerminalProfileList | null,
  selectedProfile: TerminalProfile | null,
  draft: TerminalProfileInput | null,
): TerminalProfileCapabilities {
  return {
    canCreateProfile: Boolean(profiles?.profiles.length),
    canDeleteProfile: Boolean(selectedProfile && selectedProfile.id !== "default"),
    canDuplicateProfile: Boolean(selectedProfile),
    canMakeDefaultProfile: Boolean(
      selectedProfile && selectedProfile.id !== profiles?.defaultProfileId,
    ),
    canSaveProfile: Boolean(draft && selectedProfile),
  };
}

interface ProfileEditorState {
  argsText: string;
  draft: TerminalProfileInput | null;
  envText: string;
  selectedId: string;
}

const labelClassName = "grid gap-1 text-xs font-medium text-muted-foreground";
const inputClassName =
  "h-8 rounded-sm border border-input bg-card px-2 text-xs text-foreground outline-none transition-colors focus:border-ring";
const selectClassName =
  "h-8 rounded-sm border border-input bg-card px-2 text-xs text-foreground outline-none transition-colors focus:border-ring";
const textareaClassName =
  "min-h-20 rounded-sm border border-input bg-card px-2 py-1.5 font-mono text-xs text-foreground outline-none transition-colors focus:border-ring";

function profileEditorState(
  profiles: TerminalProfileList | null,
  preferredId: string,
): ProfileEditorState {
  const profile = selectedProfileFromList(profiles, preferredId);
  return {
    argsText: profile ? argsToText(profile.args) : "",
    draft: profile ? terminalProfileInput(profile) : null,
    envText: profile ? envToText(profile.env) : "",
    selectedId: profile?.id ?? "",
  };
}

function selectedProfileFromList(
  profiles: TerminalProfileList | null,
  preferredId: string,
): TerminalProfile | null {
  return (
    profiles?.profiles.find((profile) => profile.id === preferredId) ??
    profiles?.profiles.find((profile) => profile.id === profiles.defaultProfileId) ??
    profiles?.profiles[0] ??
    null
  );
}

function createProfileInput(
  copyFrom: TerminalProfile | null,
  selectedProfile: TerminalProfile | null,
  profiles: TerminalProfileList | null,
): TerminalProfileInput | null {
  const source = copyFrom ?? selectedProfile ?? profiles?.profiles[0] ?? null;
  if (!source) {
    return null;
  }
  const profile = terminalProfileInput(source);
  profile.name = copyFrom ? `${source.name} copy` : "New profile";
  return profile;
}

function profileOptionLabel(profile: TerminalProfile, defaultProfileId: string): string {
  return profile.id === defaultProfileId ? `${profile.name} (default)` : profile.name;
}

function IconButton({
  children,
  disabled = false,
  label,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-border bg-card text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-45"
      disabled={disabled}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function draftWithTextFields(
  draft: TerminalProfileInput,
  argsText: string,
  envText: string,
): TerminalProfileInput {
  return {
    ...draft,
    args: argsFromText(argsText),
    env: envFromText(envText),
  };
}

function argsToText(args: string[]): string {
  return args.join("\n");
}

function argsFromText(value: string): string[] {
  return value.split("\n").filter((line) => line !== "");
}

function envToText(env: Record<string, string>): string {
  return Object.entries(env)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

function envFromText(value: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [index, rawLine] of value.split("\n").entries()) {
    const line = rawLine.trim();
    if (line === "") {
      continue;
    }
    const separator = line.indexOf("=");
    if (separator <= 0) {
      throw new Error(`Env line ${index + 1} must be KEY=value`);
    }
    env[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return env;
}

function newestProfile(
  next: TerminalProfileList,
  previous: TerminalProfileList | null,
): TerminalProfile | null {
  const previousIds = new Set((previous?.profiles ?? []).map((profile) => profile.id));
  return next.profiles.find((profile) => !previousIds.has(profile.id)) ?? null;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Terminal profile operation failed.";
}
