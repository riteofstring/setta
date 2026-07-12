import type {
  Role,
  RoleConfiguration,
  RoleModelOption,
  RoleProfile,
  RoleProfileConfiguration,
  RoleProfileUpdate,
} from "@generated/backend";
import { BrainCircuit, Loader2, RotateCcw, Save } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import { Button } from "./ui/button";

const providerDefaultValue = "__provider_default__";

interface RoleDraft {
  clearOverride: boolean;
  profile: RoleProfile;
}

interface RoleConfigurationFormProps {
  configuration: RoleConfiguration;
  onSave: (updates: RoleProfileUpdate[]) => Promise<RoleConfiguration>;
}

export function RoleConfigurationSettings() {
  const [configuration, setConfiguration] = useState<RoleConfiguration | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const roles = window.setta.roles;
    if (!roles) {
      setError("Role configuration is unavailable in this client.");
      return;
    }
    let active = true;
    void roles.readGlobal().then(
      (next) => {
        if (active) {
          setConfiguration(next);
          setError(null);
        }
      },
      (reason: unknown) => {
        if (active) {
          setError(errorMessage(reason));
        }
      },
    );
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return <RoleConfigurationMessage kind="error">{error}</RoleConfigurationMessage>;
  }
  if (!configuration) {
    return (
      <RoleConfigurationMessage kind="loading">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading role configuration
      </RoleConfigurationMessage>
    );
  }

  return (
    <RoleConfigurationForm
      configuration={configuration}
      onSave={async (updates) => {
        const roles = window.setta.roles;
        if (!roles) {
          throw new Error("Role configuration is unavailable in this client.");
        }
        const next = await roles.updateGlobal({ updates });
        setConfiguration(next);
        return next;
      }}
    />
  );
}

export function RoleConfigurationForm({ configuration, onSave }: RoleConfigurationFormProps) {
  const [drafts, setDrafts] = useState(() => roleDrafts(configuration));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDrafts(roleDrafts(configuration));
    setError(null);
  }, [configuration]);

  const updates = useMemo(() => roleProfileUpdates(configuration, drafts), [configuration, drafts]);
  const dirty = updates.length > 0;

  const updateDraft = (role: Role, update: (draft: RoleDraft) => RoleDraft) => {
    setDrafts((current) => {
      const draft = current[role];
      if (!draft) {
        throw new Error(`Role configuration is missing ${role}.`);
      }
      return { ...current, [role]: update(draft) };
    });
    setError(null);
  };

  return (
    <form
      className="grid gap-3"
      data-testid="role-configuration-settings"
      onSubmit={(event) => {
        event.preventDefault();
        if (!dirty || saving) {
          return;
        }
        setSaving(true);
        setError(null);
        void onSave(updates).then(
          (next) => {
            setDrafts(roleDrafts(next));
            setSaving(false);
          },
          (reason: unknown) => {
            setError(errorMessage(reason));
            setSaving(false);
          },
        );
      }}
    >
      <header className="grid gap-2">
        <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <BrainCircuit className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <h2 className="text-xs font-semibold tracking-wide text-foreground">AI Roles</h2>
              <p className="text-[11px] text-muted-foreground">
                Models and reasoning resolve independently for each role.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              disabled={!dirty || saving}
              onClick={() => {
                setDrafts(roleDrafts(configuration));
                setError(null);
              }}
              type="button"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Revert
            </Button>
            <Button disabled={!dirty || saving} type="submit" variant="primary">
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Save
            </Button>
          </div>
        </div>
        {error ? (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : dirty ? (
          <p className="text-[11px] text-muted-foreground" role="status">
            Unsaved role configuration changes
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground" role="status">
            Provider catalog validated · {configuration.modelCatalog.models.length} models
          </p>
        )}
      </header>

      <div className="grid gap-2 md:grid-cols-2">
        {configuration.profiles.map((profile) => {
          const draft = drafts[profile.role];
          if (!draft) {
            throw new Error(`Role configuration is missing draft ${profile.role}.`);
          }
          return (
            <RoleProfileCard
              configuration={profile}
              disabled={saving}
              draft={draft}
              key={profile.role}
              models={configuration.modelCatalog.models}
              onEffortChange={(effort) =>
                updateDraft(profile.role, (current) => ({
                  clearOverride: false,
                  profile: { ...current.profile, reasoningEffort: effort },
                }))
              }
              onModelChange={(modelValue) =>
                updateDraft(profile.role, (current) =>
                  draftWithModel(current, modelValue, configuration.modelCatalog),
                )
              }
              onReset={() =>
                updateDraft(profile.role, () => ({
                  clearOverride: true,
                  profile: cloneRoleProfile(profile.builtIn),
                }))
              }
              onServiceTierChange={(serviceTier) =>
                updateDraft(profile.role, (current) => ({
                  clearOverride: false,
                  profile: { ...current.profile, serviceTier },
                }))
              }
            />
          );
        })}
      </div>
    </form>
  );
}

function RoleProfileCard({
  configuration,
  disabled,
  draft,
  models,
  onEffortChange,
  onModelChange,
  onReset,
  onServiceTierChange,
}: {
  configuration: RoleProfileConfiguration;
  disabled: boolean;
  draft: RoleDraft;
  models: RoleModelOption[];
  onEffortChange: (effort: string) => void;
  onModelChange: (model: string) => void;
  onReset: () => void;
  onServiceTierChange: (serviceTier: string | null) => void;
}) {
  const selectedModel = selectedRoleModel(draft.profile, models);
  const metadata = roleMetadata[configuration.role];
  const overrideLabel = roleOverrideLabel(configuration, draft);
  const modelValue =
    draft.profile.modelSelection.mode === "provider_default"
      ? providerDefaultValue
      : (draft.profile.modelSelection.modelId ?? "");

  return (
    <fieldset className="grid min-w-0 gap-2 rounded-sm border border-border bg-card/40 p-3">
      <legend className="sr-only">{metadata.label} configuration</legend>
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-xs font-semibold text-foreground">{metadata.label}</h3>
          <p className="text-[11px] leading-4 text-muted-foreground">{metadata.description}</p>
        </div>
        <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {overrideLabel}
        </span>
      </div>

      <label className="grid gap-1 text-[11px] text-muted-foreground">
        Model
        <select
          aria-label={`${metadata.label} model`}
          className="h-8 min-w-0 rounded-sm border border-input bg-background px-2 text-xs text-foreground outline-none focus-visible:border-ring"
          disabled={disabled}
          onChange={(event) => onModelChange(event.currentTarget.value)}
          value={modelValue}
        >
          <option value={providerDefaultValue}>
            Provider default (
            {models.find((model) => model.isDefault)?.displayName ?? "unavailable"})
          </option>
          {models.map((model) => (
            <option key={model.modelId} value={model.modelId}>
              {model.displayName}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-1 text-[11px] text-muted-foreground">
        Reasoning effort
        <select
          aria-label={`${metadata.label} reasoning effort`}
          className="h-8 rounded-sm border border-input bg-background px-2 text-xs text-foreground outline-none focus-visible:border-ring"
          disabled={disabled}
          onChange={(event) => onEffortChange(event.currentTarget.value)}
          value={draft.profile.reasoningEffort}
        >
          {selectedModel.supportedReasoningEfforts.map((effort) => (
            <option key={effort} value={effort}>
              {reasoningEffortLabel(effort)}
            </option>
          ))}
        </select>
      </label>

      {selectedModel.serviceTiers.length > 0 ? (
        <label className="grid gap-1 text-[11px] text-muted-foreground">
          Service tier
          <select
            aria-label={`${metadata.label} service tier`}
            className="h-8 rounded-sm border border-input bg-background px-2 text-xs text-foreground outline-none focus-visible:border-ring"
            disabled={disabled}
            onChange={(event) => onServiceTierChange(event.currentTarget.value || null)}
            value={draft.profile.serviceTier ?? ""}
          >
            <option value="">Catalog default</option>
            {selectedModel.serviceTiers.map((tier) => (
              <option key={tier} value={tier}>
                {tier}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="grid gap-1 border-t border-border/70 pt-2 text-[10px] text-muted-foreground">
        <span>
          Effective: {configuration.resolved.modelId} · {configuration.resolved.reasoningEffort}
        </span>
        <span>
          Permissions: {permissionLabel(draft.profile)} ·{" "}
          {draft.profile.contextBudget.maxInputTokens.toLocaleString()} input tokens
        </span>
      </div>
      <Button
        disabled={disabled || (draft.clearOverride && configuration.override === null)}
        onClick={onReset}
        type="button"
      >
        Use built-in {metadata.label.toLowerCase()}
      </Button>
    </fieldset>
  );
}

function roleOverrideLabel(configuration: RoleProfileConfiguration, draft: RoleDraft): string {
  if (draft.clearOverride) {
    return "Built-in after save";
  }
  return configuration.override ? "Global override" : "Built-in";
}

function RoleConfigurationMessage({
  children,
  kind,
}: {
  children: ReactNode;
  kind: "error" | "loading";
}) {
  return (
    <div
      className="flex min-h-16 items-center gap-2 rounded-sm border border-border px-3 text-xs text-muted-foreground"
      role={kind === "error" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}

function roleDrafts(configuration: RoleConfiguration): Partial<Record<Role, RoleDraft>> {
  return Object.fromEntries(
    configuration.profiles.map((profile) => [
      profile.role,
      { clearOverride: false, profile: cloneRoleProfile(profile.effective) },
    ]),
  );
}

function roleProfileUpdates(
  configuration: RoleConfiguration,
  drafts: Partial<Record<Role, RoleDraft>>,
): RoleProfileUpdate[] {
  const updates: RoleProfileUpdate[] = [];
  for (const current of configuration.profiles) {
    const draft = drafts[current.role];
    if (!draft) {
      continue;
    }
    if (draft.clearOverride) {
      if (current.override) {
        updates.push({ profile: null, role: current.role });
      }
      continue;
    }
    if (roleProfilesEqual(draft.profile, current.effective)) {
      continue;
    }
    updates.push({ profile: cloneRoleProfile(draft.profile), role: current.role });
  }
  return updates;
}

function draftWithModel(
  draft: RoleDraft,
  modelValue: string,
  catalog: RoleConfiguration["modelCatalog"],
): RoleDraft {
  const model =
    modelValue === providerDefaultValue
      ? catalog.models.find((candidate) => candidate.modelId === catalog.defaultModelId)
      : catalog.models.find((candidate) => candidate.modelId === modelValue);
  if (!model) {
    throw new Error(`Role model ${modelValue} is absent from the provider catalog.`);
  }
  const reasoningEffort = model.supportedReasoningEfforts.includes(draft.profile.reasoningEffort)
    ? draft.profile.reasoningEffort
    : model.defaultReasoningEffort;
  const serviceTier =
    draft.profile.serviceTier === null || model.serviceTiers.includes(draft.profile.serviceTier)
      ? draft.profile.serviceTier
      : null;
  return {
    clearOverride: false,
    profile: {
      ...draft.profile,
      modelSelection:
        modelValue === providerDefaultValue
          ? { mode: "provider_default", modelId: null }
          : { mode: "exact", modelId: model.modelId },
      reasoningEffort,
      serviceTier,
    },
  };
}

function selectedRoleModel(profile: RoleProfile, models: RoleModelOption[]): RoleModelOption {
  const selected =
    profile.modelSelection.mode === "provider_default"
      ? models.find((model) => model.isDefault)
      : models.find((model) => model.modelId === profile.modelSelection.modelId);
  if (!selected) {
    throw new Error(`Configured role model is absent from the provider catalog.`);
  }
  return selected;
}

function cloneRoleProfile(profile: RoleProfile): RoleProfile {
  return {
    ...profile,
    contextBudget: { ...profile.contextBudget },
    modelSelection: { ...profile.modelSelection },
    permissionProfile: {
      ...profile.permissionProfile,
      toolAccess: {
        ...profile.permissionProfile.toolAccess,
        allowedTools: [...profile.permissionProfile.toolAccess.allowedTools],
      },
    },
  };
}

function roleProfilesEqual(left: RoleProfile, right: RoleProfile): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function permissionLabel(profile: RoleProfile): string {
  const permission = profile.permissionProfile.providerPermissionProfile;
  return permission.startsWith(":") ? permission.slice(1) : permission;
}

function reasoningEffortLabel(effort: string): string {
  return effort === "xhigh" ? "Extra high" : effort.charAt(0).toUpperCase() + effort.slice(1);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const roleMetadata = {
  agent: {
    description: "Primary workspace agent for durable topic work.",
    label: "Agent",
  },
  narrator: {
    description: "Lightweight projection, status, and local routing role.",
    label: "Narrator",
  },
  master: {
    description: "Restricted global topic discovery and routing role.",
    label: "Master",
  },
  side_agent: {
    description: "Read-only focused follow-up and side-conversation role.",
    label: "Side agent",
  },
} satisfies Record<Role, { description: string; label: string }>;
