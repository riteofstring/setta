import {
  callOpenAPI,
  type ResponseDataAndStatus,
} from "@setta/app-subsystem-frontend-sdk";

import { writePluginConfig } from "openapi/http";

import { usePluginRuntimeStore } from "plugins/runtime";

import { useEffect, useMemo, useState } from "react";

import { buildPluginPaneOverviewTabName } from "utils/constants";

import type { PluginListEntry } from "utils/generatedTypes";

import { onOverviewTabClick } from "../../../paneFns";

import {
  buildPluginSourceIdentityToken,
  buildSourceManagerGuidanceMessage,
  formatPluginConfigDraft,
  isLinkedLocalPluginSource,
  parsePluginConfigDraft,
  resolvePluginConfigFieldPresentation,
  type PluginConfigFieldDefinition,
} from "../PluginsPane.helpers";

import {
  DEFAULT_PLUGIN_SERVER_MODE,
  EMPTY_PLUGIN_COMMANDS,
  EMPTY_PLUGIN_PANES,
  pluginListEntryCardRuntimeStateEqual,
} from "./installAndDiscovery";

import {
  PluginCapabilitiesSection,
  PluginCommandsSection,
  PluginConfigSection,
  PluginFrontendErrorNotice,
  PluginListEntryCardHeader,
  PluginListEntryCardProps,
  PluginListEntryCardViewProps,
  PluginPanesSection,
  PluginSourceGuidanceNotices,
  buildPluginToggleLabel,
  buildPythonPluginSelectionState,
  resolvePluginCapabilitySummary,
  runRollbackPluginAction,
  runUninstallPluginAction,
  runUpdatePluginAction,
} from "./pluginList";

import { ActionButton, isPlainObject } from "./pluginUtils";

export function PluginListEntryCardBadges({
  isSelectedForPython,
  restartRequired,
}: {
  isSelectedForPython: boolean;
  restartRequired: boolean;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-1">
      {isSelectedForPython ? (
        <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700 dark:bg-blue-900/40 dark:text-blue-200">
          Python selected
        </span>
      ) : null}
      {restartRequired ? (
        <span className="rounded bg-yellow-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300">
          restart required
        </span>
      ) : null}
    </div>
  );
}

function PluginListEntryCardActions({
  pluginId,
  pluginToggleLabel,
  pluginActionDisabled,
  packageManagerManaged,
  linkedLocalSource,
  canUseForPython,
  onEnablePlugin,
  onDisablePlugin,
  onUseForPython,
  onUpdate,
  onRollback,
  onUninstall,
}: {
  pluginId: string;
  pluginToggleLabel: "Enable" | "Disable";
  pluginActionDisabled: boolean;
  packageManagerManaged: boolean;
  linkedLocalSource: boolean;
  canUseForPython: boolean;
  onEnablePlugin: () => void;
  onDisablePlugin: () => void;
  onUseForPython: () => void;
  onUpdate: () => void;
  onRollback: () => void;
  onUninstall: () => void;
}) {
  const toggleAction =
    pluginToggleLabel === "Enable" ? onEnablePlugin : onDisablePlugin;
  const updateAndRollbackDisabled =
    pluginActionDisabled || packageManagerManaged || linkedLocalSource;
  const uninstallDisabled = pluginActionDisabled || packageManagerManaged;

  return (
    <div className="flex flex-wrap gap-1">
      <ActionButton
        label={pluginToggleLabel}
        onClick={toggleAction}
        disabled={pluginActionDisabled}
        testId={`plugin-card-toggle-${pluginId}`}
      />
      {canUseForPython ? (
        <ActionButton
          label="Use for Python"
          onClick={onUseForPython}
          disabled={pluginActionDisabled}
          testId={`plugin-card-use-python-${pluginId}`}
        />
      ) : null}
      <ActionButton
        label="Update"
        onClick={onUpdate}
        disabled={updateAndRollbackDisabled}
      />
      <ActionButton
        label="Rollback"
        onClick={onRollback}
        disabled={updateAndRollbackDisabled}
      />
      <ActionButton
        label="Uninstall"
        onClick={onUninstall}
        disabled={uninstallDisabled}
      />
    </div>
  );
}

function PluginListEntryCardView({
  plugin,
  pluginActionDisabled,
  packageManagerManaged,
  linkedLocalSource,
  packageManagerGuidance,
  isSettingsProject,
  runAction,
  requestedCapabilities,
  effectiveCapabilities,
  blockedCapabilities,
  commands,
  commandUnavailableMessage,
  frontendError,
  panes,
  paneButtonsDisabled,
  paneUnavailableMessage,
  isSelectedForPython,
  canUseForPython,
  pluginToggleLabel,
  onEnablePlugin,
  onDisablePlugin,
  onUseForPython,
  onUpdate,
  onRollback,
  onUninstall,
  onOpenPane,
}: PluginListEntryCardViewProps) {
  return (
    <article className="rounded border border-setta-200 bg-setta-50/60 p-2 dark:border-setta-800 dark:bg-setta-950/40">
      <PluginListEntryCardHeader
        plugin={plugin}
        isSelectedForPython={isSelectedForPython}
      />
      <PluginListEntryCardActions
        pluginId={plugin.pluginId}
        pluginToggleLabel={pluginToggleLabel}
        pluginActionDisabled={pluginActionDisabled}
        packageManagerManaged={packageManagerManaged}
        linkedLocalSource={linkedLocalSource}
        canUseForPython={canUseForPython}
        onEnablePlugin={onEnablePlugin}
        onDisablePlugin={onDisablePlugin}
        onUseForPython={onUseForPython}
        onUpdate={onUpdate}
        onRollback={onRollback}
        onUninstall={onUninstall}
      />
      <PluginSourceGuidanceNotices
        pluginId={plugin.pluginId}
        packageManagerManaged={packageManagerManaged}
        packageManagerGuidance={packageManagerGuidance}
        linkedLocalSource={linkedLocalSource}
      />
      <PluginConfigSection
        plugin={plugin}
        isSettingsProject={isSettingsProject}
        disabled={pluginActionDisabled}
        runAction={runAction}
      />
      <PluginCapabilitiesSection
        requestedCapabilities={requestedCapabilities}
        effectiveCapabilities={effectiveCapabilities}
        blockedCapabilities={blockedCapabilities}
      />
      <PluginCommandsSection
        pluginId={plugin.pluginId}
        commands={commands}
        unavailableMessage={commandUnavailableMessage}
      />
      <PluginFrontendErrorNotice frontendError={frontendError} />
      <PluginPanesSection
        pluginId={plugin.pluginId}
        panes={panes}
        disabled={paneButtonsDisabled}
        unavailableMessage={paneUnavailableMessage}
        onOpenPane={onOpenPane}
      />
    </article>
  );
}

export function PluginListEntryCard({
  plugin,
  isSettingsProject,
  pythonSelectionStatus,
  writeActionsLocked,
  isAnyPluginActionBusy,
  runEnablePlugin,
  runDisablePlugin,
  selectPythonLanguageServer,
  runAction,
}: PluginListEntryCardProps) {
  const runtimeState = usePluginRuntimeStore(
    (state) => ({
      serverMode: state.serverMode ?? DEFAULT_PLUGIN_SERVER_MODE,
      pluginStatus: state.pluginStatusById[plugin.pluginId] ?? null,
      panes: state.panesByPluginId[plugin.pluginId] ?? EMPTY_PLUGIN_PANES,
      commands:
        state.commandsByPluginId[plugin.pluginId] ?? EMPTY_PLUGIN_COMMANDS,
      frontendError: state.frontendErrorsByPluginId[plugin.pluginId] ?? null,
    }),
    pluginListEntryCardRuntimeStateEqual,
  );
  const { serverMode, pluginStatus, panes, commands, frontendError } =
    runtimeState;
  const packageManagerManaged = plugin.sourceManager === "package_manager";
  const linkedLocalSource = isLinkedLocalPluginSource(plugin);
  const packageManagerGuidance = buildSourceManagerGuidanceMessage(plugin);
  const pluginActionBusy = isAnyPluginActionBusy(plugin.pluginId);
  const pluginActionDisabled = writeActionsLocked || pluginActionBusy;
  const paneButtonsDisabled = writeActionsLocked;
  const requestedCapabilities = pluginStatus?.requestedCapabilities ?? [];
  const effectiveCapabilities =
    pluginStatus?.effectiveCapabilities ?? plugin.effectiveCapabilities;
  const blockedCapabilities = pluginStatus?.blockedCapabilities ?? [];
  const pluginToggleLabel = buildPluginToggleLabel(pluginStatus);
  const { isSelectedForPython, canUseForPython } =
    buildPythonPluginSelectionState(plugin.pluginId, pythonSelectionStatus);
  const { commandUnavailableMessage, paneUnavailableMessage } = useMemo(
    () =>
      resolvePluginCapabilitySummary({
        requestedCapabilities,
        effectiveCapabilities,
        blockedCapabilities,
        serverMode,
      }),
    [
      blockedCapabilities,
      effectiveCapabilities,
      requestedCapabilities,
      serverMode,
    ],
  );
  return (
    <PluginListEntryCardView
      plugin={plugin}
      pluginActionDisabled={pluginActionDisabled}
      packageManagerManaged={packageManagerManaged}
      linkedLocalSource={linkedLocalSource}
      packageManagerGuidance={packageManagerGuidance}
      isSettingsProject={isSettingsProject}
      runAction={runAction}
      requestedCapabilities={requestedCapabilities}
      effectiveCapabilities={effectiveCapabilities}
      blockedCapabilities={blockedCapabilities}
      commands={commands}
      commandUnavailableMessage={commandUnavailableMessage}
      frontendError={frontendError}
      panes={panes}
      paneButtonsDisabled={paneButtonsDisabled}
      paneUnavailableMessage={paneUnavailableMessage}
      isSelectedForPython={isSelectedForPython}
      canUseForPython={canUseForPython}
      pluginToggleLabel={pluginToggleLabel}
      onEnablePlugin={() => {
        void runEnablePlugin(plugin.pluginId);
      }}
      onDisablePlugin={() => {
        void runDisablePlugin(plugin.pluginId);
      }}
      onUseForPython={() => {
        void selectPythonLanguageServer(plugin.pluginId);
      }}
      onUpdate={() => {
        void runUpdatePluginAction(plugin, runAction);
      }}
      onRollback={() => {
        void runRollbackPluginAction(plugin, runAction);
      }}
      onUninstall={() => {
        void runUninstallPluginAction(plugin, runAction);
      }}
      onOpenPane={(paneId) => {
        onOverviewTabClick(
          buildPluginPaneOverviewTabName(plugin.pluginId, paneId),
        );
      }}
    />
  );
}

export function CapabilityRow({
  label,
  entries,
  emptyLabel,
  className = "",
  tone = "default",
}: {
  label: string;
  entries: string[];
  emptyLabel: string;
  className?: string;
  tone?: "default" | "blocked";
}) {
  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => a.localeCompare(b)),
    [entries],
  );
  const badgeClassName =
    tone === "blocked"
      ? "rounded border border-red-300 bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-300"
      : "rounded border border-setta-300 bg-setta-50 px-1.5 py-0.5 text-[10px] font-medium text-setta-700 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200";
  return (
    <div className={className}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
        {label}
      </p>
      {sortedEntries.length > 0 ? (
        <div className="mt-1 flex flex-wrap gap-1">
          {sortedEntries.map((entry) => (
            <span key={`${label}:${entry}`} className={badgeClassName}>
              {entry}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-[11px] text-setta-500 dark:text-setta-400">
          {emptyLabel}
        </p>
      )}
    </div>
  );
}

export function PluginConfigEditor({
  plugin,
  disabled,
  runAction,
}: {
  plugin: PluginListEntry;
  disabled: boolean;
  runAction: <T>(
    actionKey: string,
    actionLabel: string,
    operation: () => Promise<ResponseDataAndStatus<T>>,
  ) => Promise<ResponseDataAndStatus<T> | null>;
}) {
  const [draftRaw, setDraftRaw] = useState("{}");
  const [status, setStatus] = useState<SettingsEditorStatus | null>(null);
  const sourceIdentityToken = useMemo(
    () => buildPluginSourceIdentityToken(plugin),
    [plugin.canonicalSourceKey, plugin.sourceDigestSha256, plugin.sourceScope],
  );
  const schemaFields = useMemo(
    () => getTopLevelPluginConfigFields(plugin.config.schemaJson),
    [plugin.config.schemaJson],
  );
  const editableSchemaFields = useMemo(
    () =>
      schemaFields.filter((field) =>
        isSupportedTopLevelPluginConfigField(field.schema),
      ),
    [schemaFields],
  );
  const unsupportedSchemaFields = useMemo(
    () =>
      schemaFields
        .filter((field) => !isSupportedTopLevelPluginConfigField(field.schema))
        .map((field) => field.key),
    [schemaFields],
  );
  const parsedDraft = useMemo(
    () => parsePluginConfigDraft(draftRaw),
    [draftRaw],
  );
  const parsedConfig = parsedDraft.error ? {} : parsedDraft.value;
  useEffect(() => {
    setDraftRaw(formatPluginConfigDraft(plugin.config.currentConfig));
    setStatus(null);
  }, [plugin.config.currentConfig, plugin.pluginId, sourceIdentityToken]);
  function onFieldValueChange(fieldKey: string, nextValue: unknown) {
    if (parsedDraft.error) {
      return;
    }
    const nextConfig = setTopLevelPluginConfigValue(
      parsedDraft.value,
      fieldKey,
      nextValue,
    );
    setDraftRaw(formatPluginConfigDraft(nextConfig));
    setStatus(null);
  }
  async function onSavePluginConfig() {
    if (parsedDraft.error) {
      setStatus({ type: "error", message: parsedDraft.error });
      return;
    }
    const response = await runAction(
      `config:${plugin.pluginId}`,
      "Save plugin config",
      async () =>
        callOpenAPI(
          writePluginConfig({
            body: {
              pluginId: plugin.pluginId,
              config: parsedDraft.value,
            },
          } as Parameters<typeof writePluginConfig>[0]),
        ),
    );
    if (!response) {
      return;
    }
    setStatus({
      type: "success",
      message: "Plugin config saved.",
    });
  }
  return (
    <section className="mt-2 rounded border border-setta-200 bg-white p-2 dark:border-setta-800 dark:bg-setta-950">
      <h5 className="text-[11px] font-semibold uppercase tracking-tight text-setta-500 dark:text-setta-400">
        Plugin Config
      </h5>
      {editableSchemaFields.length > 0 ? (
        <div className="mt-2 flex flex-col gap-2">
          {editableSchemaFields.map((field) => (
            <PluginConfigTopLevelField
              key={`${plugin.pluginId}:${field.key}`}
              field={field}
              config={parsedConfig}
              disabled={disabled || parsedDraft.error !== null}
              onValueChange={onFieldValueChange}
            />
          ))}
        </div>
      ) : (
        <p className="mt-1 text-[11px] text-setta-500 dark:text-setta-400">
          No top-level primitive fields were detected from schema; use raw JSON.
        </p>
      )}
      {unsupportedSchemaFields.length > 0 ? (
        <p className="mt-2 text-[11px] text-setta-500 dark:text-setta-400">
          Complex fields (edit in raw JSON):{" "}
          {unsupportedSchemaFields.join(", ")}
        </p>
      ) : null}
      <div className="mt-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
          Raw JSON
        </p>
        <textarea
          className="mt-1 h-28 w-full rounded border border-setta-300 bg-white p-2 font-mono text-[11px] text-setta-800 outline-none focus:border-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-100"
          value={draftRaw}
          onChange={(event) => {
            setDraftRaw(event.target.value);
            setStatus(null);
          }}
          spellCheck={false}
          disabled={disabled}
        />
      </div>
      {parsedDraft.error ? (
        <p className="mt-2 text-[11px] text-red-700 dark:text-red-300">
          {parsedDraft.error}
        </p>
      ) : null}
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-[10px] text-setta-500 dark:text-setta-400">
          Config is stored in plugin state (`plugins_state.json`) for this
          workspace.
        </p>
        <button
          type="button"
          className="rounded border border-setta-300 px-2 py-1 text-[11px] font-medium text-setta-700 hover:bg-setta-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-700 dark:text-setta-200 dark:hover:bg-setta-800"
          onClick={() => {
            void onSavePluginConfig();
          }}
          disabled={disabled}
        >
          Save Plugin Config
        </button>
      </div>
      {status ? (
        <p
          className={`mt-2 text-[11px] ${
            status.type === "error"
              ? "text-red-700 dark:text-red-300"
              : "text-green-700 dark:text-green-300"
          }`}
        >
          {status.message}
        </p>
      ) : null}
    </section>
  );
}

function PluginConfigTopLevelField({
  field,
  config,
  disabled,
  onValueChange,
}: {
  field: PluginConfigFieldDefinition;
  config: Record<string, unknown>;
  disabled: boolean;
  onValueChange: (fieldKey: string, nextValue: unknown) => void;
}) {
  const { value, displayLabelText, descriptionText } =
    resolvePluginConfigFieldPresentation(field, config);
  const input = buildPluginConfigFieldInput({
    field,
    value,
    disabled,
    onValueChange,
  });
  if (!input) {
    return null;
  }
  return (
    <div className="rounded border border-setta-200 bg-setta-50/70 p-2 dark:border-setta-850 dark:bg-setta-900/40">
      <p className="text-[11px] font-semibold text-setta-700 dark:text-setta-200">
        {displayLabelText}
      </p>
      <PluginConfigFieldDescription descriptionText={descriptionText} />
      {input}
    </div>
  );
}

function PluginConfigFieldDescription({
  descriptionText,
}: {
  descriptionText: string | null;
}) {
  if (!descriptionText) {
    return null;
  }
  return (
    <p className="mt-0.5 text-[10px] text-setta-500 dark:text-setta-400">
      {descriptionText}
    </p>
  );
}

function buildPluginConfigEnumInput({
  fieldKey,
  value,
  disabled,
  enumValues,
  onValueChange,
}: {
  fieldKey: string;
  value: unknown;
  disabled: boolean;
  enumValues: Array<string | number | boolean>;
  onValueChange: (fieldKey: string, nextValue: unknown) => void;
}) {
  const enumOptions = enumValues.map((enumValue) => ({
    raw: enumValue,
    serialized: JSON.stringify(enumValue),
  }));
  const selectedOption = enumOptions.find((option) => option.raw === value);
  const selectValue =
    value === undefined
      ? "__unset__"
      : selectedOption?.serialized ?? JSON.stringify(value);
  return (
    <select
      className="mt-1 w-full rounded border border-setta-300 bg-white px-2 py-1 text-[11px] text-setta-800 outline-none focus:border-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-100"
      value={selectValue}
      onChange={(event) => {
        if (event.target.value === "__unset__") {
          onValueChange(fieldKey, undefined);
          return;
        }
        try {
          onValueChange(fieldKey, JSON.parse(event.target.value));
        } catch {
          onValueChange(fieldKey, undefined);
        }
      }}
      disabled={disabled}
    >
      <option value="__unset__">unset</option>
      {enumOptions.map((enumOption) => (
        <option key={enumOption.serialized} value={enumOption.serialized}>
          {String(enumOption.raw)}
        </option>
      ))}
    </select>
  );
}

function buildPluginConfigBooleanInput({
  fieldKey,
  value,
  disabled,
  onValueChange,
}: {
  fieldKey: string;
  value: unknown;
  disabled: boolean;
  onValueChange: (fieldKey: string, nextValue: unknown) => void;
}) {
  return (
    <label className="mt-1 inline-flex items-center gap-2 text-[11px] text-setta-700 dark:text-setta-200">
      <input
        type="checkbox"
        checked={Boolean(value)}
        onChange={(event) => {
          onValueChange(fieldKey, event.target.checked);
        }}
        disabled={disabled}
      />
      {value ? "Enabled" : "Disabled"}
    </label>
  );
}

function buildPluginConfigNumberInput({
  fieldKey,
  value,
  disabled,
  schemaType,
  onValueChange,
}: {
  fieldKey: string;
  value: unknown;
  disabled: boolean;
  schemaType: "integer" | "number";
  onValueChange: (fieldKey: string, nextValue: unknown) => void;
}) {
  const numberValue =
    typeof value === "number" && Number.isFinite(value) ? String(value) : "";
  return (
    <input
      type="number"
      className="mt-1 w-full rounded border border-setta-300 bg-white px-2 py-1 text-[11px] text-setta-800 outline-none focus:border-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-100"
      value={numberValue}
      onChange={(event) => {
        const rawValue = event.target.value;
        if (rawValue.trim() === "") {
          onValueChange(fieldKey, undefined);
          return;
        }
        const parsed = Number(rawValue);
        if (!Number.isFinite(parsed)) {
          return;
        }
        if (schemaType === "integer" && !Number.isInteger(parsed)) {
          return;
        }
        onValueChange(fieldKey, parsed);
      }}
      disabled={disabled}
    />
  );
}

function buildPluginConfigStringInput({
  field,
  value,
  disabled,
  onValueChange,
}: {
  field: PluginConfigFieldDefinition;
  value: unknown;
  disabled: boolean;
  onValueChange: (fieldKey: string, nextValue: unknown) => void;
}) {
  const uiHint = getSchemaUiHint(field.schema);
  const formatValue = field.schema.format;
  const format = typeof formatValue === "string" ? formatValue : "";
  const stringValue = typeof value === "string" ? value : "";
  const useTextArea =
    uiHint === "textarea" || uiHint === "json" || uiHint === "code";
  const inputType =
    uiHint === "password" || format === "password" ? "password" : "text";
  if (useTextArea) {
    return (
      <textarea
        className="mt-1 h-20 w-full rounded border border-setta-300 bg-white px-2 py-1 text-[11px] text-setta-800 outline-none focus:border-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-100"
        value={stringValue}
        onChange={(event) => {
          onValueChange(field.key, event.target.value);
        }}
        spellCheck={false}
        disabled={disabled}
      />
    );
  }
  return (
    <input
      type={inputType}
      className="mt-1 w-full rounded border border-setta-300 bg-white px-2 py-1 text-[11px] text-setta-800 outline-none focus:border-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-100"
      value={stringValue}
      onChange={(event) => {
        onValueChange(field.key, event.target.value);
      }}
      disabled={disabled}
    />
  );
}

function buildPluginConfigFieldInput({
  field,
  value,
  disabled,
  onValueChange,
}: {
  field: PluginConfigFieldDefinition;
  value: unknown;
  disabled: boolean;
  onValueChange: (fieldKey: string, nextValue: unknown) => void;
}) {
  const enumValues = getSchemaEnumValues(field.schema);
  if (enumValues) {
    return buildPluginConfigEnumInput({
      fieldKey: field.key,
      value,
      disabled,
      enumValues,
      onValueChange,
    });
  }
  const schemaType = resolveSchemaType(field.schema);
  if (schemaType === "boolean") {
    return buildPluginConfigBooleanInput({
      fieldKey: field.key,
      value,
      disabled,
      onValueChange,
    });
  }
  if (schemaType === "integer" || schemaType === "number") {
    return buildPluginConfigNumberInput({
      fieldKey: field.key,
      value,
      disabled,
      schemaType,
      onValueChange,
    });
  }
  if (schemaType === "string") {
    return buildPluginConfigStringInput({
      field,
      value,
      disabled,
      onValueChange,
    });
  }
  return null;
}

type SettingsEditorStatus = {
  type: "error" | "success";
  message: string;
};

function resolveSchemaType(schema: Record<string, unknown>): string | null {
  const rawType = schema.type;
  if (typeof rawType === "string") {
    return rawType;
  }
  if (!Array.isArray(rawType)) {
    return null;
  }
  for (const value of rawType) {
    if (typeof value === "string" && value !== "null") {
      return value;
    }
  }
  return null;
}

function getSchemaEnumValues(
  schema: Record<string, unknown>,
): Array<string | number | boolean> | null {
  const rawEnum = schema.enum;
  if (!Array.isArray(rawEnum) || rawEnum.length === 0) {
    return null;
  }
  const values: Array<string | number | boolean> = [];
  for (const enumValue of rawEnum) {
    if (
      typeof enumValue === "string" ||
      typeof enumValue === "number" ||
      typeof enumValue === "boolean"
    ) {
      values.push(enumValue);
    }
  }
  if (values.length === 0) {
    return null;
  }
  return values;
}

function getSchemaUiHint(schema: Record<string, unknown>): string | null {
  const rawUiHint = schema["x-setta-ui"];
  if (typeof rawUiHint !== "string") {
    return null;
  }
  const trimmed = rawUiHint.trim();
  if (trimmed === "") {
    return null;
  }
  return trimmed;
}

function isSupportedTopLevelPluginConfigField(
  schema: Record<string, unknown>,
): boolean {
  if (getSchemaEnumValues(schema)) {
    return true;
  }
  const schemaType = resolveSchemaType(schema);
  return (
    schemaType === "string" ||
    schemaType === "number" ||
    schemaType === "integer" ||
    schemaType === "boolean"
  );
}

function getTopLevelPluginConfigFields(
  schemaJson: Record<string, unknown> | null,
): PluginConfigFieldDefinition[] {
  if (!isPlainObject(schemaJson)) {
    return [];
  }
  const properties = schemaJson.properties;
  if (!isPlainObject(properties)) {
    return [];
  }
  const requiredRaw = schemaJson.required;
  const requiredFields = new Set<string>();
  if (Array.isArray(requiredRaw)) {
    for (const value of requiredRaw) {
      if (typeof value === "string") {
        requiredFields.add(value);
      }
    }
  }
  const fields: PluginConfigFieldDefinition[] = [];
  for (const [key, value] of Object.entries(properties)) {
    if (!isPlainObject(value)) {
      continue;
    }
    fields.push({
      key,
      required: requiredFields.has(key),
      schema: value,
    });
  }
  fields.sort((a, b) => a.key.localeCompare(b.key));
  return fields;
}

function setTopLevelPluginConfigValue(
  config: Record<string, unknown>,
  fieldKey: string,
  nextValue: unknown,
): Record<string, unknown> {
  const nextConfig = { ...config };
  if (nextValue === undefined) {
    delete nextConfig[fieldKey];
  } else {
    nextConfig[fieldKey] = nextValue;
  }
  return nextConfig;
}
