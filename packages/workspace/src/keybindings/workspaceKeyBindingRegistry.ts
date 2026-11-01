import { isMacOs } from "../canvas/utils.js";
import { getWorkspaceCreationCommands } from "../context-menu/creationCommandStore.js";
import type { WorkspaceCreationCommand } from "../context-menu/workspaceMenuTypes.js";
import {
  listBuiltInWorkspaceKeyBindings,
  type WorkspaceKeyBindingDefinition,
} from "./builtInWorkspaceKeyBindings.js";
import { createWorkspaceCreationKeyBinding } from "./creationKeyBindings.js";
import { listReservedWorkspaceGestures } from "./reservedWorkspaceGestures.js";
import {
  getChordSuppressesBrowserDefault,
  getChordYieldsToEditableTarget,
} from "./workspaceChordPolicy.js";
import {
  formatWorkspaceChord,
  getWorkspaceChordSignature,
  parseWorkspaceChord,
  type ParsedWorkspaceChord,
} from "./workspaceChords.js";
import type {
  WorkspaceKeyBinding,
  WorkspaceKeyBindingConflict,
  WorkspaceKeyBindingDescriptor,
} from "./workspaceKeyBindingTypes.js";
import type { WorkspaceHost } from "../workspaceHost.js";

type ChordAssignment = {
  chord: string;
  definition: WorkspaceKeyBindingDefinition;
  origin: "default" | "host";
  parsed: ParsedWorkspaceChord;
};

export type ResolvedWorkspaceKeyBinding = Readonly<{
  chord: ParsedWorkspaceChord;
  definition: WorkspaceKeyBindingDefinition;
  suppressesBrowserDefault: boolean;
  yieldsToEditableTarget: boolean;
}>;

function listWorkspaceKeyBindingDefinitions(
  host: WorkspaceHost,
  creationCommands: ReadonlyArray<WorkspaceCreationCommand> = getWorkspaceCreationCommands(
    host,
  ),
): Array<WorkspaceKeyBindingDefinition> {
  return [
    ...listBuiltInWorkspaceKeyBindings(host),
    ...creationCommands.map((command) =>
      createWorkspaceCreationKeyBinding(host, command),
    ),
  ];
}

type WorkspaceKeyBindingRegistryState = {
  hostChords: ReadonlyMap<string, string | null>;
  resolvedByPlatform: Map<boolean, ReadonlyArray<ResolvedWorkspaceKeyBinding>>;
};

const statesByHost = new WeakMap<
  WorkspaceHost,
  WorkspaceKeyBindingRegistryState
>();

function getRegistryState(
  host: WorkspaceHost,
): WorkspaceKeyBindingRegistryState {
  const existing = statesByHost.get(host);
  if (existing) {
    return existing;
  }
  const state: WorkspaceKeyBindingRegistryState = {
    hostChords: new Map(),
    resolvedByPlatform: new Map(),
  };
  statesByHost.set(host, state);
  return state;
}

function assertKnownBindingId(
  id: string,
  definitions: ReadonlyArray<WorkspaceKeyBindingDefinition>,
): void {
  if (!definitions.some((definition) => definition.id === id)) {
    throw new Error(
      `Workspace key binding ${JSON.stringify(id)} is not a workspace operation.`,
    );
  }
}

function buildHostChords(
  bindings: ReadonlyArray<WorkspaceKeyBinding>,
  definitions: ReadonlyArray<WorkspaceKeyBindingDefinition>,
): Map<string, string | null> {
  if (!Array.isArray(bindings)) {
    throw new Error("Workspace key bindings must be an array.");
  }
  const chords = new Map<string, string | null>();
  for (const binding of bindings) {
    assertKnownBindingId(binding.id, definitions);
    if (chords.has(binding.id)) {
      throw new Error(`Workspace key binding ${binding.id} is bound twice.`);
    }
    if (binding.chord !== null) {
      parseWorkspaceChord(binding.chord);
    }
    chords.set(binding.id, binding.chord);
  }
  return chords;
}

function buildChordAssignments(
  chordsById: ReadonlyMap<string, string | null>,
  definitions: ReadonlyArray<WorkspaceKeyBindingDefinition>,
): Array<ChordAssignment> {
  return definitions.flatMap((definition) => {
    const overridden = chordsById.has(definition.id);
    const chord = overridden
      ? chordsById.get(definition.id)
      : definition.defaultChord;
    if (chord === null || chord === undefined) {
      return [];
    }
    return [
      {
        chord,
        definition,
        origin: overridden ? ("host" as const) : ("default" as const),
        parsed: parseWorkspaceChord(chord),
      },
    ];
  });
}

function toConflict(
  assignments: ReadonlyArray<ChordAssignment>,
  reservedGesture: string | null,
): WorkspaceKeyBindingConflict {
  const first = assignments[0];
  if (!first) {
    throw new Error(
      "Workspace key binding conflict needs at least one binding.",
    );
  }
  return Object.freeze({
    chord: first.chord,
    chordLabel: formatWorkspaceChord(first.parsed, isMacOs()),
    bindingIds: Object.freeze(
      assignments.map((assignment) => assignment.definition.id),
    ),
    reservedGesture,
  });
}

function findChordConflicts(
  assignments: ReadonlyArray<ChordAssignment>,
): ReadonlyArray<WorkspaceKeyBindingConflict> {
  const macOS = isMacOs();
  const reservedNamesBySignature = new Map(
    listReservedWorkspaceGestures().map((gesture) => [
      getWorkspaceChordSignature(gesture.chord, macOS),
      gesture.name,
    ]),
  );
  const assignmentsBySignature = new Map<string, Array<ChordAssignment>>();
  for (const assignment of assignments) {
    const signature = getWorkspaceChordSignature(assignment.parsed, macOS);
    const existing = assignmentsBySignature.get(signature);
    if (existing) {
      existing.push(assignment);
      continue;
    }
    assignmentsBySignature.set(signature, [assignment]);
  }
  const conflicts: Array<WorkspaceKeyBindingConflict> = [];
  for (const [signature, shared] of assignmentsBySignature) {
    const reservedGesture = reservedNamesBySignature.get(signature) ?? null;
    if (shared.length > 1 || reservedGesture !== null) {
      conflicts.push(toConflict(shared, reservedGesture));
    }
  }
  return Object.freeze(conflicts);
}

function describeConflict(conflict: WorkspaceKeyBindingConflict): string {
  const bindings = conflict.bindingIds.join(", ");
  if (conflict.reservedGesture) {
    return `Workspace key binding chord ${conflict.chordLabel} (${bindings}) is reserved for ${conflict.reservedGesture}.`;
  }
  return `Workspace key binding chord ${conflict.chordLabel} is claimed by ${bindings}.`;
}

function assertNoChordConflicts(
  assignments: ReadonlyArray<ChordAssignment>,
): void {
  const conflicts = findChordConflicts(assignments);
  if (conflicts.length > 0) {
    throw new Error(conflicts.map(describeConflict).join(" "));
  }
}

export function getWorkspaceKeyBindingConflicts(
  host: WorkspaceHost,
  bindings: ReadonlyArray<WorkspaceKeyBinding>,
): ReadonlyArray<WorkspaceKeyBindingConflict> {
  const definitions = listWorkspaceKeyBindingDefinitions(host);
  return findChordConflicts(
    buildChordAssignments(buildHostChords(bindings, definitions), definitions),
  );
}

export function registerWorkspaceKeyBindings(
  host: WorkspaceHost,
  bindings: ReadonlyArray<WorkspaceKeyBinding>,
): void {
  const definitions = listWorkspaceKeyBindingDefinitions(host);
  const chords = buildHostChords(bindings, definitions);
  assertNoChordConflicts(buildChordAssignments(chords, definitions));
  const state = getRegistryState(host);
  state.hostChords = chords;
  state.resolvedByPlatform.clear();
}

export function assertWorkspaceKeyBindingsForCreationCommands(
  host: WorkspaceHost,
  creationCommands: ReadonlyArray<WorkspaceCreationCommand>,
): void {
  const state = getRegistryState(host);
  const definitions = listWorkspaceKeyBindingDefinitions(
    host,
    creationCommands,
  );
  for (const id of state.hostChords.keys()) {
    assertKnownBindingId(id, definitions);
  }
  assertNoChordConflicts(buildChordAssignments(state.hostChords, definitions));
}

export function invalidateResolvedWorkspaceKeyBindings(
  host: WorkspaceHost,
): void {
  getRegistryState(host).resolvedByPlatform.clear();
}

export function getWorkspaceKeyBindings(
  host: WorkspaceHost,
): ReadonlyArray<WorkspaceKeyBindingDescriptor> {
  const macOS = isMacOs();
  const state = getRegistryState(host);
  const definitions = listWorkspaceKeyBindingDefinitions(host);
  const assignmentsById = new Map(
    buildChordAssignments(state.hostChords, definitions).map((assignment) => [
      assignment.definition.id,
      assignment,
    ]),
  );
  return Object.freeze(
    definitions.map((definition) => {
      const assignment = assignmentsById.get(definition.id);
      return Object.freeze({
        id: definition.id,
        label: definition.getLabel(),
        chord: assignment?.chord ?? null,
        chordLabel: assignment
          ? formatWorkspaceChord(assignment.parsed, macOS)
          : null,
        origin:
          assignment?.origin ??
          (state.hostChords.has(definition.id) ? "host" : "default"),
      });
    }),
  );
}

export function getWorkspaceKeyBindingChordLabel(
  host: WorkspaceHost,
  id: string,
): string | null {
  const definitions = listWorkspaceKeyBindingDefinitions(host);
  assertKnownBindingId(id, definitions);
  const assignment = buildChordAssignments(
    getRegistryState(host).hostChords,
    definitions,
  ).find((candidate) => candidate.definition.id === id);
  return assignment ? formatWorkspaceChord(assignment.parsed, isMacOs()) : null;
}

export function getResolvedWorkspaceKeyBindings(
  host: WorkspaceHost,
  macOS: boolean,
): ReadonlyArray<ResolvedWorkspaceKeyBinding> {
  const state = getRegistryState(host);
  const cached = state.resolvedByPlatform.get(macOS);
  if (cached) {
    return cached;
  }
  const resolved = Object.freeze(
    buildChordAssignments(
      state.hostChords,
      listWorkspaceKeyBindingDefinitions(host),
    ).map((assignment) =>
      Object.freeze({
        chord: assignment.parsed,
        definition: assignment.definition,
        suppressesBrowserDefault: getChordSuppressesBrowserDefault(
          assignment.parsed,
        ),
        yieldsToEditableTarget: getChordYieldsToEditableTarget(
          assignment.parsed,
          macOS,
        ),
      }),
    ),
  );
  state.resolvedByPlatform.set(macOS, resolved);
  return resolved;
}
