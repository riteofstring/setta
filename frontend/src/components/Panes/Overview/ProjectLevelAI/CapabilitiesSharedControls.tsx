import { type ReactNode } from "react";
import { CapabilityModeEnum, type SkillEntry } from "utils/generatedTypes";

export type CapabilitiesTab = "skills" | "mcp";

type CapabilityMode =
  (typeof CapabilityModeEnum)[keyof typeof CapabilityModeEnum];

export function CapabilitiesTabToggle({
  activeTab,
  onChange,
}: {
  activeTab: CapabilitiesTab;
  onChange: (tab: CapabilitiesTab) => void;
}) {
  const baseTabClasses =
    "nodrag inline-flex h-8 min-w-[4.75rem] items-center justify-center rounded-t-md border px-3 text-[11px] font-semibold transition-colors focus-visible:ring-2";
  return (
    <div
      className="flex items-end gap-1"
      role="tablist"
      aria-label="Capabilities"
    >
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === "skills"}
        className={`${baseTabClasses} ${
          activeTab === "skills"
            ? "border-setta-300/80 bg-white text-blue-600 shadow-sm hover:bg-white dark:border-setta-700 dark:bg-setta-900 dark:text-blue-300 dark:hover:bg-setta-900"
            : "border-transparent text-setta-500 hover:bg-setta-100/80 hover:text-setta-900 dark:text-setta-400 dark:hover:bg-setta-800/70 dark:hover:text-setta-100"
        }`}
        onClick={() => onChange("skills")}
      >
        Skills
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === "mcp"}
        className={`${baseTabClasses} ${
          activeTab === "mcp"
            ? "border-setta-300/80 bg-white text-blue-600 shadow-sm hover:bg-white dark:border-setta-700 dark:bg-setta-900 dark:text-blue-300 dark:hover:bg-setta-900"
            : "border-transparent text-setta-500 hover:bg-setta-100/80 hover:text-setta-900 dark:text-setta-400 dark:hover:bg-setta-800/70 dark:hover:text-setta-100"
        }`}
        onClick={() => onChange("mcp")}
      >
        MCP
      </button>
    </div>
  );
}

export function CapabilityStateToggle({
  mode,
  onChange,
  disabled,
}: {
  mode: CapabilityMode;
  onChange: (mode: CapabilityMode) => void;
  disabled: boolean;
}) {
  const baseButtonClasses =
    "nodrag inline-flex h-7 items-center justify-center rounded-md border px-2 text-[11px] font-semibold transition-colors focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60";
  return (
    <div className="grid grid-cols-1 gap-1 rounded-md border border-setta-200/80 bg-setta-100/50 p-1 @[13rem]:grid-cols-3 dark:border-setta-800 dark:bg-setta-900/60">
      <button
        type="button"
        aria-pressed={mode === CapabilityModeEnum.disabled}
        className={`${baseButtonClasses} ${
          mode === CapabilityModeEnum.disabled
            ? "border-red-500/60 bg-red-500/20 text-red-700 shadow-sm hover:!bg-red-500/20 hover:text-red-700 dark:border-red-500/60 dark:bg-red-500/30 dark:text-red-200 dark:hover:!bg-red-500/30 dark:hover:text-red-200"
            : "border-transparent text-setta-500 hover:border-setta-300/70 hover:bg-white/80 hover:text-setta-900 dark:text-setta-400 dark:hover:border-setta-700/70 dark:hover:bg-setta-800/80 dark:hover:text-setta-100"
        }`}
        onClick={() => onChange(CapabilityModeEnum.disabled)}
        disabled={disabled}
      >
        Disabled
      </button>
      <button
        type="button"
        aria-pressed={mode === CapabilityModeEnum.inherit}
        className={`${baseButtonClasses} ${
          mode === CapabilityModeEnum.inherit
            ? "border-blue-500/60 bg-blue-500/20 text-blue-700 shadow-sm hover:!bg-blue-500/20 hover:text-blue-700 dark:border-blue-500/60 dark:bg-blue-500/30 dark:text-blue-200 dark:hover:!bg-blue-500/30 dark:hover:text-blue-200"
            : "border-transparent text-setta-500 hover:border-setta-300/70 hover:bg-white/80 hover:text-setta-900 dark:text-setta-400 dark:hover:border-setta-700/70 dark:hover:bg-setta-800/80 dark:hover:text-setta-100"
        }`}
        onClick={() => onChange(CapabilityModeEnum.inherit)}
        disabled={disabled}
      >
        Inherit
      </button>
      <button
        type="button"
        aria-pressed={mode === CapabilityModeEnum.custom}
        className={`${baseButtonClasses} ${
          mode === CapabilityModeEnum.custom
            ? "border-blue-500/60 bg-blue-500/20 text-blue-700 shadow-sm hover:!bg-blue-500/20 hover:text-blue-700 dark:border-blue-500/60 dark:bg-blue-500/30 dark:text-blue-200 dark:hover:!bg-blue-500/30 dark:hover:text-blue-200"
            : "border-transparent text-setta-500 hover:border-setta-300/70 hover:bg-white/80 hover:text-setta-900 dark:text-setta-400 dark:hover:border-setta-700/70 dark:hover:bg-setta-800/80 dark:hover:text-setta-100"
        }`}
        onClick={() => onChange(CapabilityModeEnum.custom)}
        disabled={disabled}
      >
        Custom
      </button>
    </div>
  );
}

export function CapabilitySkillsList({
  skills,
  selectedSkillIds,
  onToggleSkill,
  isDisabled,
  emptyMessage,
  maxHeightClassName,
  renderRowAction,
}: {
  skills: SkillEntry[];
  selectedSkillIds: string[];
  onToggleSkill: (skillId: string, selected: boolean) => void;
  isDisabled: boolean;
  emptyMessage: string;
  maxHeightClassName: string;
  renderRowAction?: (skill: SkillEntry) => ReactNode;
}) {
  return (
    <div
      className={`flex w-full min-w-0 flex-col gap-1 overflow-y-auto overflow-x-hidden ${maxHeightClassName}`}
    >
      {skills.map((skill) => {
        const selected = selectedSkillIds.includes(skill.id);
        const disableToggle = isDisabled || Boolean(skill.parseError);
        return (
          <div
            key={skill.id}
            className="flex w-full min-w-0 items-start gap-2 rounded px-1 py-1 text-[11px] text-setta-700 hover:bg-setta-100/80 dark:text-setta-200 dark:hover:bg-setta-800/60"
          >
            <label className="flex w-full min-w-0 flex-1 items-start gap-2 overflow-hidden">
              <input
                type="checkbox"
                checked={selected}
                onChange={(event) =>
                  onToggleSkill(skill.id, event.target.checked)
                }
                disabled={disableToggle}
                className="mt-0.5 h-4 w-4 rounded-md bg-setta-500/10 checked:bg-blue-500 hover:bg-setta-500/30 hover:checked:bg-blue-500"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">
                  {skill.name}
                </span>
                <span className="block truncate text-setta-500 dark:text-setta-400">
                  {skill.id}
                </span>
                {skill.parseError ? (
                  <span className="block text-red-600 dark:text-red-400">
                    {skill.parseError}
                  </span>
                ) : null}
              </span>
            </label>
            {renderRowAction ? renderRowAction(skill) : null}
          </div>
        );
      })}
      {skills.length === 0 ? (
        <p className="text-[11px] text-setta-500 dark:text-setta-400">
          {emptyMessage}
        </p>
      ) : null}
    </div>
  );
}

export function CapabilityMcpServerList({
  serverIds,
  selectedIds,
  onToggleServer,
  isDisabled,
  emptyMessage,
  maxHeightClassName,
}: {
  serverIds: string[];
  selectedIds: string[];
  onToggleServer: (serverId: string, selected: boolean) => void;
  isDisabled: boolean;
  emptyMessage: string;
  maxHeightClassName: string;
}) {
  return (
    <div
      className={`flex w-full min-w-0 flex-col gap-1 overflow-y-auto overflow-x-hidden ${maxHeightClassName}`}
    >
      {serverIds.map((serverId) => (
        <label
          key={serverId}
          className="flex min-w-0 items-center gap-2 text-[11px] text-setta-700 dark:text-setta-200"
        >
          <input
            type="checkbox"
            checked={selectedIds.includes(serverId)}
            onChange={(event) => onToggleServer(serverId, event.target.checked)}
            disabled={isDisabled}
            className="h-4 w-4 rounded-md bg-setta-500/10 checked:bg-blue-500 hover:bg-setta-500/30 hover:checked:bg-blue-500"
          />
          <span className="truncate">{serverId}</span>
        </label>
      ))}
      {serverIds.length === 0 ? (
        <p className="text-[11px] text-setta-500 dark:text-setta-400">
          {emptyMessage}
        </p>
      ) : null}
    </div>
  );
}
