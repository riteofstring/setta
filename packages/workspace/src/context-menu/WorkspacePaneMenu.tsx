import { matchSorter } from "match-sorter";
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { TbSortAZ } from "react-icons/tb";
import { getReactFlowStore } from "../canvas/store.js";
import { insertWorkspaceSection } from "../document/insertWorkspaceSection.js";
import { useWorkspaceHost } from "../workspaceHostContext.js";
import {
  getFilterEditingKey,
  getFilterInputState,
  getNextFilterInputState,
  isMenuNavigationKey,
  shouldDispatchFilterInputEvent,
  shouldEditableTargetHandleMenuKey,
} from "./paneMenuKeyboard.js";
import {
  WorkspaceMenuCore,
  WorkspaceMenuEntryDescriptions,
  WorkspaceMenuGroup,
  WorkspaceMenuItem,
  WorkspaceMenuLabel,
  WorkspaceMenuSeparator,
  type WorkspaceMenuEntry,
} from "./WorkspaceMenuCore.js";
import type { WorkspaceMenuInvocation } from "./workspaceMenuState.js";
import { closeWorkspaceMenu } from "./workspaceMenuState.js";
import type {
  WorkspaceCreationCommand,
  WorkspaceCreationContext,
} from "./workspaceMenuTypes.js";

type PaneInvocation = Extract<WorkspaceMenuInvocation, { kind: "pane" }>;

function groupCommands(
  commands: ReadonlyArray<WorkspaceCreationCommand>,
): ReadonlyArray<{ group: string; commands: Array<WorkspaceCreationCommand> }> {
  const groups = new Map<string, Array<WorkspaceCreationCommand>>();
  for (const command of commands) {
    const group = groups.get(command.group) ?? [];
    group.push(command);
    groups.set(command.group, group);
  }
  return [...groups].map(([group, groupedCommands]) => ({
    group,
    commands: groupedCommands,
  }));
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export function WorkspacePaneMenu({
  actions,
  canEditStructure,
  commands,
  invocation,
}: {
  actions: ReadonlyArray<WorkspaceMenuEntry>;
  canEditStructure: boolean;
  commands: ReadonlyArray<WorkspaceCreationCommand>;
  invocation: PaneInvocation;
}) {
  const host = useWorkspaceHost();
  const [query, setQuery] = useState("");
  const filterRef = useRef<HTMLInputElement>(null);
  const itemElementsRef = useRef(new Map<string, HTMLDivElement>());
  const didNavigateListRef = useRef(false);
  const creationContext = useMemo<WorkspaceCreationContext>(
    () => Object.freeze({ workspacePosition: invocation.workspacePosition }),
    [invocation.workspacePosition],
  );
  const filteredCommands = useMemo(
    () => matchSorter(commands, query, { keys: ["label", "group"] }),
    [commands, query],
  );
  const commandEntries = useMemo(
    () =>
      filteredCommands.map<WorkspaceMenuEntry>((command) => ({
        id: `create-${command.id}`,
        label: command.label,
        icon: command.icon,
        disabled:
          !canEditStructure || (command.isDisabled?.(creationContext) ?? false),
        onSelect: () => {
          const section = command.createSection(creationContext);

          insertWorkspaceSection(host, section, invocation.workspacePosition);
          getReactFlowStore(host).setState({ nodesSelectionDims: null });
          closeWorkspaceMenu(host);
        },
      })),
    [
      canEditStructure,
      creationContext,
      filteredCommands,
      host,
      invocation.workspacePosition,
    ],
  );
  const entriesByCommandId = useMemo(
    () =>
      new Map(
        commandEntries.map((entry) => [
          entry.id.slice("create-".length),
          entry,
        ]),
      ),
    [commandEntries],
  );
  const groupedCommands = useMemo(
    () => groupCommands(filteredCommands),
    [filteredCommands],
  );

  function registerItem(entryId: string, element: HTMLDivElement | null): void {
    if (element) {
      itemElementsRef.current.set(entryId, element);
    } else {
      itemElementsRef.current.delete(entryId);
    }
  }

  function getEnabledEntries(): Array<WorkspaceMenuEntry> {
    return [...commandEntries, ...actions].filter((entry) => !entry.disabled);
  }

  function focusBoundaryEntry(boundary: "first" | "last"): void {
    const entries = getEnabledEntries();
    const entry = boundary === "first" ? entries[0] : entries.at(-1);
    if (entry) {
      itemElementsRef.current.get(entry.id)?.focus({ preventScroll: true });
    }
  }

  function applyKeyToFilter(key: string, resetInput: boolean): void {
    const input = filterRef.current;
    if (!input) {
      throw new Error("Workspace pane menu filter is not mounted.");
    }
    const next = getNextFilterInputState(
      getFilterInputState(input, resetInput),
      key,
    );
    if (shouldDispatchFilterInputEvent(resetInput, next)) {
      setQuery(next.nextValue);
    }
    requestAnimationFrame(() => {
      const currentInput = filterRef.current;
      if (!currentInput) {
        return;
      }
      currentInput.focus({ preventScroll: true });
      currentInput.setSelectionRange(next.nextSelection, next.nextSelection);
    });
  }

  function handleFilterKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeWorkspaceMenu(host);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      didNavigateListRef.current = true;
      focusBoundaryEntry(event.key === "ArrowDown" ? "first" : "last");
      return;
    }
    const editingKey = getFilterEditingKey(event.key);
    if (editingKey && didNavigateListRef.current) {
      event.preventDefault();
      event.stopPropagation();
      applyKeyToFilter(editingKey, true);
      didNavigateListRef.current = false;
      return;
    }
    if (editingKey) {
      didNavigateListRef.current = false;
    }
    event.stopPropagation();
  }

  function handleMenuKeyDownCapture(
    event: KeyboardEvent<HTMLDivElement>,
  ): void {
    if (
      shouldEditableTargetHandleMenuKey(
        isEditableTarget(event.target),
        didNavigateListRef.current,
      )
    ) {
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    const editingKey = getFilterEditingKey(event.key);
    if (!editingKey) {
      if (isMenuNavigationKey(event.key)) {
        didNavigateListRef.current = true;
      }
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    applyKeyToFilter(editingKey, didNavigateListRef.current);
    didNavigateListRef.current = false;
  }

  return (
    <WorkspaceMenuCore
      ariaLabel="Create a workspace section"
      clientPoint={invocation.clientPoint}
      direction={invocation.direction}
      initialFocus={() => {
        filterRef.current?.focus({ preventScroll: true });
        filterRef.current?.select();
      }}
      invocationSequence={invocation.sequence}
      kind="pane"
      onKeyDownCapture={handleMenuKeyDownCapture}
    >
      <search className="setta-workspace-menu-filter">
        <span aria-hidden="true" className="setta-workspace-menu-filter-icon">
          <TbSortAZ focusable="false" />
        </span>
        <input
          aria-label="Filter sections"
          onChange={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={handleFilterKeyDown}
          placeholder="Filter"
          ref={filterRef}
          value={query}
        />
      </search>
      {groupedCommands.map(({ group, commands: commandsInGroup }) => (
        <WorkspaceMenuGroup key={group}>
          <WorkspaceMenuLabel>{group}</WorkspaceMenuLabel>
          {commandsInGroup.map((command) => {
            const entry = entriesByCommandId.get(command.id);
            if (!entry) {
              throw new Error(
                `Workspace pane menu lost creation command ${command.id}.`,
              );
            }
            return (
              <WorkspaceMenuItem
                entry={entry}
                key={entry.id}
                registerElement={(element) => registerItem(entry.id, element)}
              />
            );
          })}
        </WorkspaceMenuGroup>
      ))}
      {filteredCommands.length === 0 ? (
        <p className="setta-workspace-menu-empty" role="status">
          No matching sections
        </p>
      ) : null}
      {actions.length > 0 ? (
        <>
          <WorkspaceMenuSeparator />
          <WorkspaceMenuGroup>
            <WorkspaceMenuLabel>Actions</WorkspaceMenuLabel>
            {actions.map((entry) => (
              <WorkspaceMenuItem
                entry={entry}
                key={entry.id}
                registerElement={(element) => registerItem(entry.id, element)}
              />
            ))}
          </WorkspaceMenuGroup>
        </>
      ) : null}
      <WorkspaceMenuEntryDescriptions entries={actions} />
    </WorkspaceMenuCore>
  );
}
