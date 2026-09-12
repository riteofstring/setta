import { useWorkspaceCommandState } from "../commands/workspaceCommandResolution";
import { getWorkspaceTooltipHandlers } from "../tooltip/WorkspaceTooltip";
import { useWorkspaceHost } from "../workspaceHostContext";
import { getWorkspaceHostDomId } from "../workspaceHostInternals";
import {
  COMPACT_TOUCH_TARGET_PROPS,
  CONTROLS_DIVIDER_CLASS_NAME,
  getToggleControlClassName,
  INACTIVE_CONTROL_CLASS_NAME,
  TOGGLE_CONTROL_CLASS_NAME,
} from "./workspaceControlStyles";
import {
  resolveWorkspaceToolbarEntries,
  type WorkspaceToolbarEntry,
} from "./workspaceToolbarEntries";
import type { WorkspaceToolbarPlacement } from "./workspaceToolbarTypes";

function getContributionDescriptionId(hostId: string, key: string): string {
  return `${hostId}-toolbar-reason-${key.replace(":", "-")}`;
}

function WorkspaceToolbarContributionControl({
  entry,
}: {
  entry: WorkspaceToolbarEntry;
}) {
  const host = useWorkspaceHost();
  const hostId = getWorkspaceHostDomId(host);
  const Icon = entry.icon;

  return (
    <>
      <button
        aria-disabled={entry.disabled || undefined}
        aria-label={entry.label}
        aria-pressed={entry.checked ?? undefined}
        className={`setta-workspace-toolbar-contribution ${
          entry.checked === null
            ? `${TOGGLE_CONTROL_CLASS_NAME} ${INACTIVE_CONTROL_CLASS_NAME}`
            : getToggleControlClassName(entry.checked)
        }`}
        data-testid={`rf__toolbar-contribution-${entry.key.replace(":", "-")}`}
        onClick={() => {
          if (entry.disabled) {
            return;
          }
          entry.run();
        }}
        type="button"
        {...(entry.disabledReason === null
          ? {}
          : {
              "aria-describedby": getContributionDescriptionId(
                hostId,
                entry.key,
              ),
            })}
        {...COMPACT_TOUCH_TARGET_PROPS}
        {...getWorkspaceTooltipHandlers(host, { content: entry.tooltip })}
      >
        <span
          aria-hidden="true"
          className="setta-workspace-toolbar-contribution-icon"
        >
          <Icon />
        </span>
      </button>
      {entry.disabledReason === null ? null : (
        <span
          className="sr-only"
          id={getContributionDescriptionId(hostId, entry.key)}
        >
          {entry.disabledReason}
        </span>
      )}
    </>
  );
}

export function WorkspaceToolbarGroup({
  placement,
}: {
  placement: WorkspaceToolbarPlacement;
}) {
  const host = useWorkspaceHost();
  useWorkspaceCommandState();
  const entries = resolveWorkspaceToolbarEntries(host, placement);
  if (entries.length === 0) {
    return null;
  }
  return (
    <>
      {entries.map((entry) => (
        <WorkspaceToolbarContributionControl entry={entry} key={entry.key} />
      ))}
      <div className={CONTROLS_DIVIDER_CLASS_NAME} />
    </>
  );
}
