import { useEffect, useMemo, useState } from "react";
import { addTemporaryNotification } from "state/actions/notifications";
import { useSettings } from "state/stores/uiPreferenceStores";
import { res200, type ResponseDataAndStatus } from "utils/endpointUtils";
import {
  route_plugins_config,
  route_save_settings,
} from "utils/generatedEndpoints";
import type { PluginListEntry, SettingsState } from "utils/generatedTypes";
import {
  buildPluginActionError,
  buildPluginSourceIdentityToken,
  formatLanguageServerSettingsDraft,
  formatPluginConfigDraft,
  getLanguageServerSettingsValue,
  parseLanguageServerSettingsDraft,
  parsePluginConfigDraft,
  setLanguageServerSettingsValue,
} from "./PluginsPane.helpers";
import {
  getSchemaEnumValues,
  getSchemaUiHint,
  getTopLevelPluginConfigFields,
  isSupportedTopLevelPluginConfigField,
  resolveSchemaType,
  setTopLevelPluginConfigValue,
  type PluginConfigFieldDefinition,
} from "./pluginsPaneConfigSchema";

type SettingsEditorStatus = {
  type: "error" | "success";
  message: string;
};

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
        route_plugins_config({
          pluginId: plugin.pluginId,
          config: parsedDraft.value,
        }),
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
  const schemaType = resolveSchemaType(field.schema);
  const enumValues = getSchemaEnumValues(field.schema);
  const schemaDefault = field.schema.default;
  let value = config[field.key];
  if (value === undefined && schemaDefault !== undefined) {
    value = schemaDefault;
  }
  const label = field.schema.title;
  const labelText =
    typeof label === "string" && label.trim() ? label.trim() : field.key;
  const description = field.schema.description;
  const descriptionText =
    typeof description === "string" && description.trim()
      ? description.trim()
      : null;
  let input = null;

  if (enumValues) {
    const enumOptions = enumValues.map((enumValue) => ({
      raw: enumValue,
      serialized: JSON.stringify(enumValue),
    }));
    const selectedOption = enumOptions.find((option) => option.raw === value);
    const selectValue =
      value === undefined
        ? "__unset__"
        : selectedOption?.serialized ?? JSON.stringify(value);
    input = (
      <select
        className="mt-1 w-full rounded border border-setta-300 bg-white px-2 py-1 text-[11px] text-setta-800 outline-none focus:border-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-100"
        value={selectValue}
        onChange={(event) => {
          if (event.target.value === "__unset__") {
            onValueChange(field.key, undefined);
            return;
          }
          try {
            onValueChange(field.key, JSON.parse(event.target.value));
          } catch {
            onValueChange(field.key, undefined);
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
  } else if (schemaType === "boolean") {
    input = (
      <label className="mt-1 inline-flex items-center gap-2 text-[11px] text-setta-700 dark:text-setta-200">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => {
            onValueChange(field.key, event.target.checked);
          }}
          disabled={disabled}
        />
        {Boolean(value) ? "Enabled" : "Disabled"}
      </label>
    );
  } else if (schemaType === "integer" || schemaType === "number") {
    const numberValue =
      typeof value === "number" && Number.isFinite(value) ? String(value) : "";
    input = (
      <input
        type="number"
        className="mt-1 w-full rounded border border-setta-300 bg-white px-2 py-1 text-[11px] text-setta-800 outline-none focus:border-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-100"
        value={numberValue}
        onChange={(event) => {
          const rawValue = event.target.value;
          if (rawValue.trim() === "") {
            onValueChange(field.key, undefined);
            return;
          }
          const parsed = Number(rawValue);
          if (!Number.isFinite(parsed)) {
            return;
          }
          if (schemaType === "integer" && !Number.isInteger(parsed)) {
            return;
          }
          onValueChange(field.key, parsed);
        }}
        disabled={disabled}
      />
    );
  } else if (schemaType === "string") {
    const uiHint = getSchemaUiHint(field.schema);
    const formatValue = field.schema.format;
    const format = typeof formatValue === "string" ? formatValue : "";
    const stringValue = typeof value === "string" ? value : "";
    const useTextArea =
      uiHint === "textarea" || uiHint === "json" || uiHint === "code";
    const inputType =
      uiHint === "password" || format === "password" ? "password" : "text";
    if (useTextArea) {
      input = (
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
    } else {
      input = (
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
  }

  if (!input) {
    return null;
  }

  return (
    <div className="rounded border border-setta-200 bg-setta-50/70 p-2 dark:border-setta-850 dark:bg-setta-900/40">
      <p className="text-[11px] font-semibold text-setta-700 dark:text-setta-200">
        {labelText}
        {field.required ? " *" : ""}
      </p>
      {descriptionText ? (
        <p className="mt-0.5 text-[10px] text-setta-500 dark:text-setta-400">
          {descriptionText}
        </p>
      ) : null}
      {input}
    </div>
  );
}

export function LanguageServerSettingsEditor({
  settingsKey,
  disabled,
}: {
  settingsKey: string;
  disabled: boolean;
}) {
  const languageServerSettings = useSettings(
    (state) => state.languageServer as Record<string, unknown>,
  );
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<SettingsEditorStatus | null>(null);

  useEffect(() => {
    const settingsValue = getLanguageServerSettingsValue(
      languageServerSettings,
      settingsKey,
    );
    setDraft(formatLanguageServerSettingsDraft(settingsValue));
    setStatus(null);
  }, [languageServerSettings, settingsKey]);

  async function onSaveSettings() {
    const parsedSettings = parseLanguageServerSettingsDraft(draft);
    if (parsedSettings.error) {
      setStatus({ type: "error", message: parsedSettings.error });
      return;
    }
    const nextLanguageServerSettings = setLanguageServerSettingsValue(
      languageServerSettings,
      settingsKey,
      parsedSettings.value,
    );
    const currentSettings = useSettings.getState();
    const nextSettings: SettingsState = {
      ...currentSettings,
      languageServer: nextLanguageServerSettings,
    };
    const response = await route_save_settings({ settings: nextSettings });
    if (!res200(response)) {
      const errorMessage = buildPluginActionError(
        "Save language server settings",
        response,
      );
      setStatus({ type: "error", message: errorMessage });
      addTemporaryNotification(errorMessage, "error");
      return;
    }
    useSettings.setState(nextSettings);
    setStatus({
      type: "success",
      message: "Language server settings saved.",
    });
  }

  return (
    <div className="mt-2 rounded border border-setta-200 bg-white p-2 dark:border-setta-800 dark:bg-setta-950">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
        settings.{settingsKey}
      </p>
      <textarea
        className="mt-1 h-24 w-full rounded border border-setta-300 bg-white p-2 font-mono text-[11px] text-setta-800 outline-none focus:border-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-100"
        aria-label={`settings.${settingsKey}`}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        spellCheck={false}
        disabled={disabled}
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-[10px] text-setta-500 dark:text-setta-400">
          Enter a JSON object for this language server settings key.
        </p>
        <button
          type="button"
          className="rounded border border-setta-300 px-2 py-1 text-[11px] font-medium text-setta-700 hover:bg-setta-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-700 dark:text-setta-200 dark:hover:bg-setta-800"
          onClick={() => {
            void onSaveSettings();
          }}
          disabled={disabled}
        >
          Save Settings
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
    </div>
  );
}
