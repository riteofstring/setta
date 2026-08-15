import { isMacOs } from "../canvas/utils";
import { getWorkspaceCreationCommands } from "../context-menu/creationCommandStore";
import type { WorkspaceCreationCommand } from "../context-menu/workspaceMenuTypes";
import {
  builtInWorkspaceKeyBindings,
  type WorkspaceKeyBindingDefinition,
} from "./builtInWorkspaceKeyBindings";
import { createWorkspaceCreationKeyBinding } from "./creationKeyBindings";
import { listReservedWorkspaceGestures } from "./reservedWorkspaceGestures";
import {
  getChordSuppressesBrowserDefault,
  getChordYieldsToEditableTarget,
} from "./workspaceChordPolicy";
import {
  formatWorkspaceChord,
  getWorkspaceChordSignature,
  parseWorkspaceChord,
  type ParsedWorkspaceChord,
} from "./workspaceChords";
import type {
  WorkspaceKeyBinding,
  WorkspaceKeyBindingConflict,
  WorkspaceKeyBindingDescriptor,
} from "./workspaceKeyBindingTypes";

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

// The package's own operations plus every registered creation command that carries a chord: one
// binding vocabulary, so a host lists, rebinds, and conflict-checks both through one registry.
function listWorkspaceKeyBindingDefinitions(
  creationCommands: ReadonlyArray<WorkspaceCreationCommand> = getWorkspaceCreationCommands(),
): Array<WorkspaceKeyBindingDefinition> {
  return [
    ...builtInWorkspaceKeyBindings,
    ...creationCommands.map(createWorkspaceCreationKeyBinding),
  ];
}

// Like command, section-kind, and item-handler registration, each call replaces the complete
// host-owned set. A binding a host does not name keeps its default chord.
let hostChords: ReadonlyMap<string, string | null> = new Map();

const resolvedByPlatform = new Map<boolean, ReadonlyArray<ResolvedWorkspaceKeyBinding>>();

function assertKnownBindingId(
  id: string,
  definitions: ReadonlyArray<WorkspaceKeyBindingDefinition>,
): void {
  if (!definitions.some((definition) => definition.id === id)) {
    throw new Error(`Workspace key binding ${JSON.stringify(id)} is not a workspace operation.`);
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
      // Parsing here rejects an unusable chord before it can silently never match.
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
    const chord = overridden ? chordsById.get(definition.id) : definition.defaultChord;
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
    throw new Error("Workspace key binding conflict needs at least one binding.");
  }
  return Object.freeze({
    chord: first.chord,
    chordLabel: formatWorkspaceChord(first.parsed, isMacOs()),
    bindingIds: Object.freeze(assignments.map((assignment) => assignment.definition.id)),
    reservedGesture,
  });
}

// A conflict is decided from the parsed chord, so two spellings of one chord collide and a chord
// that a held interaction gesture already owns collides with that gesture.
function findChordConflicts(
  assignments: ReadonlyArray<ChordAssignment>,
): ReadonlyArray<WorkspaceKeyBindingConflict> {
  const reservedNamesBySignature = new Map(
    listReservedWorkspaceGestures().map((gesture) => [
      getWorkspaceChordSignature(gesture.chord),
      gesture.name,
    ]),
  );
  const assignmentsBySignature = new Map<string, Array<ChordAssignment>>();
  for (const assignment of assignments) {
    const signature = getWorkspaceChordSignature(assignment.parsed);
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

function assertNoChordConflicts(assignments: ReadonlyArray<ChordAssignment>): void {
  const conflicts = findChordConflicts(assignments);
  if (conflicts.length > 0) {
    throw new Error(conflicts.map(describeConflict).join(" "));
  }
}

// What a candidate set of host bindings would collide with, without registering it, so a host can
// explain a conflict to the person choosing the chord instead of catching a failure.
export function getWorkspaceKeyBindingConflicts(
  bindings: ReadonlyArray<WorkspaceKeyBinding>,
): ReadonlyArray<WorkspaceKeyBindingConflict> {
  const definitions = listWorkspaceKeyBindingDefinitions();
  return findChordConflicts(
    buildChordAssignments(buildHostChords(bindings, definitions), definitions),
  );
}

export function registerWorkspaceKeyBindings(bindings: ReadonlyArray<WorkspaceKeyBinding>): void {
  const definitions = listWorkspaceKeyBindingDefinitions();
  const chords = buildHostChords(bindings, definitions);
  assertNoChordConflicts(buildChordAssignments(chords, definitions));
  hostChords = chords;
  resolvedByPlatform.clear();
}

// Registering creation commands changes the binding set, so the chords a host already registered
// are checked against the incoming catalog before it takes effect.
export function assertWorkspaceKeyBindingsForCreationCommands(
  creationCommands: ReadonlyArray<WorkspaceCreationCommand>,
): void {
  const definitions = listWorkspaceKeyBindingDefinitions(creationCommands);
  for (const id of hostChords.keys()) {
    assertKnownBindingId(id, definitions);
  }
  assertNoChordConflicts(buildChordAssignments(hostChords, definitions));
}

export function invalidateResolvedWorkspaceKeyBindings(): void {
  resolvedByPlatform.clear();
}

export function getWorkspaceKeyBindings(): ReadonlyArray<WorkspaceKeyBindingDescriptor> {
  const macOS = isMacOs();
  const definitions = listWorkspaceKeyBindingDefinitions();
  const assignmentsById = new Map(
    buildChordAssignments(hostChords, definitions).map((assignment) => [
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
        chordLabel: assignment ? formatWorkspaceChord(assignment.parsed, macOS) : null,
        origin: assignment?.origin ?? (hostChords.has(definition.id) ? "host" : "default"),
      });
    }),
  );
}

// The chord rules depend on the platform, so the dispatcher resolves against the platform it is
// listening on and the result is reused until the host rebinds something.
export function getResolvedWorkspaceKeyBindings(
  macOS: boolean,
): ReadonlyArray<ResolvedWorkspaceKeyBinding> {
  const cached = resolvedByPlatform.get(macOS);
  if (cached) {
    return cached;
  }
  const resolved = Object.freeze(
    buildChordAssignments(hostChords, listWorkspaceKeyBindingDefinitions()).map((assignment) =>
      Object.freeze({
        chord: assignment.parsed,
        definition: assignment.definition,
        suppressesBrowserDefault: getChordSuppressesBrowserDefault(assignment.parsed),
        yieldsToEditableTarget: getChordYieldsToEditableTarget(assignment.parsed, macOS),
      }),
    ),
  );
  resolvedByPlatform.set(macOS, resolved);
  return resolved;
}
