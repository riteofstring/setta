import type {
  WorkspaceGraphConnection,
  WorkspaceGraphEdge,
  WorkspaceGraphPort,
  WorkspaceGraphReconnect,
} from "@setta/workspace";

import type {
  Binding,
  Project,
  ProjectOperation,
  Section,
} from "../backend/generatedContract";
import { readHandlerSectionData } from "../sections/sectionData";

type EventName = Extract<Binding["trigger"], { kind: "event" }>["event"];
type OutputField = NonNullable<Binding["outputs"][string]["target"]>["field"];
type PipelineRoot = { event: EventName; sectionId: string };

type PortMeaning =
  | { kind: "event"; event: EventName; sectionId: string }
  | { kind: "handlerTrigger"; bindingId: string }
  | { kind: "handlerInput"; bindingId: string; inputName: string }
  | { kind: "handlerOutput"; bindingId: string; outputName: string }
  | { kind: "sink"; field: OutputField; sectionId: string };
type EventMeaning = Extract<PortMeaning, { kind: "event" }>;
type HandlerInputMeaning = Extract<PortMeaning, { kind: "handlerInput" }>;
type HandlerOutputMeaning = Extract<PortMeaning, { kind: "handlerOutput" }>;
type HandlerTriggerMeaning = Extract<PortMeaning, { kind: "handlerTrigger" }>;
type SinkMeaning = Extract<PortMeaning, { kind: "sink" }>;

type RealtimeGraphProjection = {
  edges: WorkspaceGraphEdge[];
  ports: WorkspaceGraphPort[];
};

export function pruneRealtimeSelectedEdgeIds(
  selectedEdgeIds: ReadonlySet<string>,
  edges: ReadonlyArray<WorkspaceGraphEdge>,
): ReadonlySet<string> {
  const edgeIds = new Set(edges.map((edge) => edge.id));
  const next = new Set(
    [...selectedEdgeIds].filter((edgeId) => edgeIds.has(edgeId)),
  );
  return next.size === selectedEdgeIds.size ? selectedEdgeIds : next;
}

function graphId(...parts: string[]): string {
  return parts.map((part) => encodeURIComponent(part)).join(":");
}

function eventPortId(sectionId: string, event: EventName): string {
  return graphId("realtime", "event", sectionId, event);
}

function triggerPortId(bindingId: string): string {
  return graphId("realtime", "handler", bindingId, "trigger");
}

function inputPortId(bindingId: string, inputName: string): string {
  return graphId("realtime", "handler", bindingId, "input", inputName);
}

function outputPortId(bindingId: string, outputName: string): string {
  return graphId("realtime", "handler", bindingId, "output", outputName);
}

function sinkPortId(sectionId: string, field: OutputField): string {
  return graphId("realtime", "sink", sectionId, field);
}

function triggerEdgeId(bindingId: string): string {
  return graphId("realtime", "trigger", bindingId);
}

function joinEdgeId(bindingId: string, inputName: string): string {
  return graphId("realtime", "join", bindingId, inputName);
}

function displayEdgeId(bindingId: string, outputName: string): string {
  return graphId("realtime", "display", bindingId, outputName);
}

function sectionEvents(section: Section): EventName[] {
  switch (section.kind) {
    case "input":
      return ["change", "submit"];
    case "button":
      return ["press"];
    case "drawing":
      return ["snapshot"];
    default:
      return [];
  }
}

function sectionSinks(section: Section): OutputField[] {
  switch (section.kind) {
    case "input":
      return [];
    case "output":
      return ["value", "contentRef"];
    case "status":
      return ["message", "level", "progress"];
    case "drawing":
      return ["scene", "contentRef"];
    default:
      return [];
  }
}

function handlerSections(
  project: Project,
  visibleSectionIds?: ReadonlySet<string>,
): Map<string, Section> {
  const result = new Map<string, Section>();
  for (const section of Object.values(project.sections)) {
    if (
      section.kind === "handler" &&
      (visibleSectionIds === undefined || visibleSectionIds.has(section.id))
    ) {
      result.set(readHandlerSectionData(section.data).bindingId, section);
    }
  }
  return result;
}

function graphPort(value: WorkspaceGraphPort): WorkspaceGraphPort {
  return value;
}

function distributedPosition(index: number, count: number): number {
  return (index + 1) / (count + 1);
}

function sectionGraphPorts(section: Section): WorkspaceGraphPort[] {
  const events = sectionEvents(section);
  const sinks = sectionSinks(section);
  return [
    ...events.map((event, index) =>
      graphPort({
        family: "workflow",
        id: eventPortId(section.id, event),
        label: event,
        position: distributedPosition(index, events.length),
        sectionId: section.id,
        type: "source",
      }),
    ),
    ...sinks.map((field, index) =>
      graphPort({
        family: "data",
        id: sinkPortId(section.id, field),
        label: field,
        position: distributedPosition(index, sinks.length),
        sectionId: section.id,
        type: "target",
      }),
    ),
  ];
}

function bindingInputNames(binding: Binding): string[] {
  const joinInputs =
    binding.trigger.kind === "join" ? Object.keys(binding.trigger.inputs) : [];
  return [
    ...new Set([...Object.keys(binding.arguments), ...joinInputs]),
  ].sort();
}

function bindingGraphPorts(
  binding: Binding,
  section: Section,
): WorkspaceGraphPort[] {
  const inputNames = bindingInputNames(binding);
  const outputNames = Object.keys(binding.outputs).sort();
  return [
    graphPort({
      family: "workflow",
      id: triggerPortId(binding.id),
      label: "trigger",
      position: distributedPosition(0, inputNames.length + 1),
      sectionId: section.id,
      type: "target",
    }),
    ...inputNames.map((inputName, index) =>
      graphPort({
        family: "data",
        id: inputPortId(binding.id, inputName),
        label: inputName,
        position: distributedPosition(index + 1, inputNames.length + 1),
        sectionId: section.id,
        type: "target",
      }),
    ),
    ...outputNames.map((outputName, index) =>
      graphPort({
        family: "data",
        id: outputPortId(binding.id, outputName),
        label: outputName,
        position: distributedPosition(index, outputNames.length),
        sectionId: section.id,
        type: "source",
      }),
    ),
  ];
}

function eventTriggerEdges(
  binding: Binding,
  section: Section,
  visibleSectionIds: ReadonlySet<string>,
): WorkspaceGraphEdge[] {
  if (
    binding.trigger.kind !== "event" ||
    !visibleSectionIds.has(binding.trigger.sectionId)
  ) {
    return [];
  }
  return [
    {
      family: "workflow",
      id: triggerEdgeId(binding.id),
      source: {
        portId: eventPortId(binding.trigger.sectionId, binding.trigger.event),
        sectionId: binding.trigger.sectionId,
      },
      target: { portId: triggerPortId(binding.id), sectionId: section.id },
    },
  ];
}

function joinInputEdges(
  binding: Binding,
  section: Section,
  bindingsById: ReadonlyMap<string, Binding>,
  sectionsByBinding: ReadonlyMap<string, Section>,
): WorkspaceGraphEdge[] {
  if (binding.trigger.kind !== "join") {
    return [];
  }
  return Object.entries(binding.trigger.inputs)
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([inputName, input]) => {
      const producerSection = sectionsByBinding.get(input.bindingId);
      const producer = bindingsById.get(input.bindingId);
      return producerSection === undefined ||
        producer?.outputs[input.output] === undefined
        ? []
        : [
            {
              family: "data" as const,
              id: joinEdgeId(binding.id, inputName),
              label: inputName,
              source: {
                portId: outputPortId(input.bindingId, input.output),
                sectionId: producerSection.id,
              },
              target: {
                portId: inputPortId(binding.id, inputName),
                sectionId: section.id,
              },
            },
          ];
    });
}

function displayTargetEdges(
  binding: Binding,
  section: Section,
  visibleSectionIds: ReadonlySet<string>,
): WorkspaceGraphEdge[] {
  return Object.entries(binding.outputs)
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([outputName, output]) =>
      output.target === undefined ||
      !visibleSectionIds.has(output.target.sectionId)
        ? []
        : [
            {
              family: "data" as const,
              id: displayEdgeId(binding.id, outputName),
              label: outputName,
              source: {
                portId: outputPortId(binding.id, outputName),
                sectionId: section.id,
              },
              target: {
                portId: sinkPortId(
                  output.target.sectionId,
                  output.target.field,
                ),
                sectionId: output.target.sectionId,
              },
            },
          ],
    );
}

type BindingSection = { binding: Binding; section: Section };

function bindingSections(
  project: Project,
  sectionsByBinding: ReadonlyMap<string, Section>,
): BindingSection[] {
  return [...project.bindings]
    .sort((left, right) => left.id.localeCompare(right.id))
    .flatMap((binding) => {
      const section = sectionsByBinding.get(binding.id);
      return section === undefined ? [] : [{ binding, section }];
    });
}

export function projectRealtimeGraph(
  project: Project,
  visibleSectionIds: ReadonlySet<string> = new Set(
    Object.keys(project.sections),
  ),
): RealtimeGraphProjection {
  const sectionsByBinding = handlerSections(project, visibleSectionIds);
  const bindingsById = new Map(
    project.bindings.map((binding) => [binding.id, binding]),
  );
  const sections = Object.values(project.sections)
    .filter((section) => visibleSectionIds.has(section.id))
    .sort((left, right) => left.id.localeCompare(right.id));
  const pairs = bindingSections(project, sectionsByBinding);
  return {
    edges: pairs.flatMap(({ binding, section }) => [
      ...eventTriggerEdges(binding, section, visibleSectionIds),
      ...joinInputEdges(binding, section, bindingsById, sectionsByBinding),
      ...displayTargetEdges(binding, section, visibleSectionIds),
    ]),
    ports: [
      ...sections.flatMap(sectionGraphPorts),
      ...pairs.flatMap(({ binding, section }) =>
        bindingGraphPorts(binding, section),
      ),
    ],
  };
}

function sectionPortMeaning(
  section: Section,
  portId: string,
): PortMeaning | null {
  const event = sectionEvents(section).find(
    (candidate) => eventPortId(section.id, candidate) === portId,
  );
  if (event !== undefined) {
    return { event, kind: "event", sectionId: section.id };
  }
  const field = sectionSinks(section).find(
    (candidate) => sinkPortId(section.id, candidate) === portId,
  );
  return field === undefined
    ? null
    : { field, kind: "sink", sectionId: section.id };
}

function bindingPortMeaning(
  binding: Binding,
  portId: string,
): PortMeaning | null {
  if (triggerPortId(binding.id) === portId) {
    return { bindingId: binding.id, kind: "handlerTrigger" };
  }
  const inputName = bindingInputNames(binding).find(
    (candidate) => inputPortId(binding.id, candidate) === portId,
  );
  if (inputName !== undefined) {
    return { bindingId: binding.id, inputName, kind: "handlerInput" };
  }
  const outputName = Object.keys(binding.outputs).find(
    (candidate) => outputPortId(binding.id, candidate) === portId,
  );
  return outputName === undefined
    ? null
    : { bindingId: binding.id, kind: "handlerOutput", outputName };
}

function meaningForPort(project: Project, portId: string): PortMeaning | null {
  const sectionMeaning = Object.values(project.sections)
    .map((section) => sectionPortMeaning(section, portId))
    .find((meaning) => meaning !== null);
  if (sectionMeaning !== undefined) {
    return sectionMeaning;
  }
  const sectionsByBinding = handlerSections(project);
  return (
    project.bindings
      .filter((binding) => sectionsByBinding.has(binding.id))
      .map((binding) => bindingPortMeaning(binding, portId))
      .find((meaning) => meaning !== null) ?? null
  );
}

function disconnectedBinding(binding: Binding): Binding {
  return {
    ...manualStartupBinding(binding),
    trigger: { kind: "disconnected" },
  };
}

function manualStartupBinding(binding: Binding): Binding {
  return binding.materialization === undefined ||
    binding.materialization.startup === "manual"
    ? binding
    : {
        ...binding,
        materialization: { ...binding.materialization, startup: "manual" },
      };
}

function pruneJoinInputsFromProducers(
  bindings: Binding[],
  producerIds: ReadonlySet<string>,
): Binding[] {
  let next = bindings;
  let pending = new Set(producerIds);
  const processed = new Set<string>();
  while (pending.size > 0) {
    const producers = new Set(
      [...pending].filter((bindingId) => !processed.has(bindingId)),
    );
    if (producers.size === 0) {
      break;
    }
    pending = new Set();
    for (const bindingId of producers) {
      processed.add(bindingId);
    }
    next = next.map((binding) => {
      if (binding.trigger.kind !== "join") {
        return binding;
      }
      const removedInputNames = Object.entries(binding.trigger.inputs)
        .filter(([, input]) => producers.has(input.bindingId))
        .map(([inputName]) => inputName);
      if (removedInputNames.length === 0) {
        return binding;
      }
      const inputs = { ...binding.trigger.inputs };
      const argumentsWithRemovedInputs = { ...binding.arguments };
      for (const inputName of removedInputNames) {
        delete inputs[inputName];
        argumentsWithRemovedInputs[inputName] = null;
      }
      const changed = { ...binding, arguments: argumentsWithRemovedInputs };
      if (Object.keys(inputs).length === 0) {
        pending.add(binding.id);
        return disconnectedBinding(changed);
      }
      return {
        ...changed,
        trigger: { inputs, kind: "join" as const, mode: "all" as const },
      };
    });
  }
  return next;
}

function pruneRemovedProducerOutputs(
  bindings: Binding[],
  producerId: string,
  outputNames: ReadonlySet<string>,
): Binding[] {
  const disconnected = new Set<string>();
  const next = bindings.map((binding) => {
    if (binding.trigger.kind !== "join") {
      return binding;
    }
    const removedInputNames = Object.entries(binding.trigger.inputs)
      .filter(
        ([, input]) =>
          input.bindingId === producerId && outputNames.has(input.output),
      )
      .map(([inputName]) => inputName);
    if (removedInputNames.length === 0) {
      return binding;
    }
    const inputs = { ...binding.trigger.inputs };
    const argumentsWithRemovedInputs = { ...binding.arguments };
    for (const inputName of removedInputNames) {
      delete inputs[inputName];
      argumentsWithRemovedInputs[inputName] = null;
    }
    const changed = { ...binding, arguments: argumentsWithRemovedInputs };
    if (Object.keys(inputs).length === 0) {
      disconnected.add(binding.id);
      return disconnectedBinding(changed);
    }
    return {
      ...changed,
      trigger: { inputs, kind: "join" as const, mode: "all" as const },
    };
  });
  return pruneJoinInputsFromProducers(next, disconnected);
}

function detachEdge(project: Project, edgeId: string): Binding[] | null {
  const invalidatedProducerIds = new Set<string>();
  const next = project.bindings.map((binding) => {
    if (
      binding.trigger.kind === "event" &&
      triggerEdgeId(binding.id) === edgeId
    ) {
      invalidatedProducerIds.add(binding.id);
      return disconnectedBinding(binding);
    }
    if (binding.trigger.kind === "join") {
      const inputName = Object.keys(binding.trigger.inputs).find(
        (candidate) => joinEdgeId(binding.id, candidate) === edgeId,
      );
      if (inputName !== undefined) {
        const inputs = { ...binding.trigger.inputs };
        delete inputs[inputName];
        const nextBinding = {
          ...binding,
          arguments: { ...binding.arguments, [inputName]: null },
        };
        if (Object.keys(inputs).length === 0) {
          invalidatedProducerIds.add(binding.id);
          return disconnectedBinding(nextBinding);
        }
        return {
          ...nextBinding,
          trigger: { inputs, kind: "join" as const, mode: "all" as const },
        };
      }
    }
    const outputName = Object.keys(binding.outputs).find(
      (candidate) => displayEdgeId(binding.id, candidate) === edgeId,
    );
    if (outputName !== undefined) {
      return {
        ...binding,
        outputs: {
          ...binding.outputs,
          [outputName]: {},
        },
      };
    }
    return binding;
  });
  if (!next.some((binding, index) => binding !== project.bindings[index])) {
    return null;
  }
  return pruneJoinInputsFromProducers(next, invalidatedProducerIds);
}

function connectionMeanings(
  project: Project,
  connection: WorkspaceGraphConnection,
): { source: PortMeaning; target: PortMeaning } | null {
  const graph = projectRealtimeGraph(project);
  const sourcePort = graph.ports.find(
    (candidate) => candidate.id === connection.source.portId,
  );
  const targetPort = graph.ports.find(
    (candidate) => candidate.id === connection.target.portId,
  );
  if (sourcePort === undefined || targetPort === undefined) {
    return null;
  }
  const portsMatch = [
    sourcePort.type === "source",
    targetPort.type === "target",
    sourcePort.sectionId === connection.source.sectionId,
    targetPort.sectionId === connection.target.sectionId,
    sourcePort.family === connection.family,
    targetPort.family === connection.family,
  ].every(Boolean);
  if (!portsMatch) {
    return null;
  }
  const targetOccupied = graph.edges.some(
    (edge) =>
      edge.target.sectionId === connection.target.sectionId &&
      edge.target.portId === connection.target.portId,
  );
  if (targetOccupied) {
    return null;
  }
  const source = meaningForPort(project, connection.source.portId);
  const target = meaningForPort(project, connection.target.portId);
  return source === null || target === null ? null : { source, target };
}

function connectEventBinding(
  binding: Binding,
  source: EventMeaning,
  target: HandlerTriggerMeaning,
): Binding {
  if (binding.id !== target.bindingId) {
    return binding;
  }
  const argumentsWithFormerInputs = { ...binding.arguments };
  if (binding.trigger.kind === "join") {
    for (const inputName of Object.keys(binding.trigger.inputs)) {
      argumentsWithFormerInputs[inputName] = null;
    }
  }
  const connected: Binding = {
    ...binding,
    arguments: argumentsWithFormerInputs,
    trigger: {
      event: source.event,
      kind: "event",
      sectionId: source.sectionId,
    },
  };
  return source.event === "change" || source.event === "snapshot"
    ? connected
    : manualStartupBinding(connected);
}

function connectEventTrigger(
  project: Project,
  source: EventMeaning,
  target: HandlerTriggerMeaning,
): Binding[] {
  const targetRoot = bindingRootKey(project, target.bindingId);
  const nextRoot = JSON.stringify([source.sectionId, source.event]);
  const bindings =
    targetRoot !== null && targetRoot !== nextRoot
      ? pruneJoinInputsFromProducers(
          project.bindings,
          new Set([target.bindingId]),
        )
      : project.bindings;
  return bindings.map((binding) =>
    connectEventBinding(binding, source, target),
  );
}

function connectJoinBinding(
  binding: Binding,
  source: HandlerOutputMeaning,
  target: HandlerInputMeaning,
  automaticStartup: boolean,
): Binding {
  if (binding.id !== target.bindingId) {
    return binding;
  }
  const argumentsWithoutInput = { ...binding.arguments };
  delete argumentsWithoutInput[target.inputName];
  const connected: Binding = {
    ...binding,
    arguments: argumentsWithoutInput,
    trigger: {
      inputs: {
        ...(binding.trigger.kind === "join" ? binding.trigger.inputs : {}),
        [target.inputName]: {
          bindingId: source.bindingId,
          output: source.outputName,
        },
      },
      kind: "join",
      mode: "all",
    },
  };
  return automaticStartup ? connected : manualStartupBinding(connected);
}

function connectJoinInput(
  project: Project,
  source: HandlerOutputMeaning,
  target: HandlerInputMeaning,
): Binding[] | null {
  if (
    source.bindingId === target.bindingId ||
    wouldCreateCycle(project, source.bindingId, target.bindingId)
  ) {
    return null;
  }
  const sourceRoot = bindingRootKey(project, source.bindingId);
  const targetBinding = project.bindings.find(
    (binding) => binding.id === target.bindingId,
  );
  const targetRoot = bindingRootKey(project, target.bindingId);
  if (sourceRoot === null || targetBinding === undefined) {
    return null;
  }
  if (targetBinding.trigger.kind === "join" && targetRoot !== sourceRoot) {
    return null;
  }
  const bindings =
    targetBinding.trigger.kind === "event" && targetRoot !== sourceRoot
      ? pruneJoinInputsFromProducers(
          project.bindings,
          new Set([target.bindingId]),
        )
      : project.bindings;
  const automaticStartup =
    realtimeAutomaticStartupSource(project, source.bindingId) !== null;
  return bindings.map((binding) =>
    connectJoinBinding(binding, source, target, automaticStartup),
  );
}

function sinkIsOccupied(project: Project, target: SinkMeaning): boolean {
  return project.bindings.some((binding) =>
    Object.values(binding.outputs).some(
      (output) =>
        output.target?.sectionId === target.sectionId &&
        output.target.field === target.field,
    ),
  );
}

function connectDisplayTarget(
  project: Project,
  source: HandlerOutputMeaning,
  target: SinkMeaning,
): Binding[] | null {
  const producer = project.bindings.find(
    (binding) => binding.id === source.bindingId,
  );
  if (
    producer?.outputs[source.outputName]?.target !== undefined ||
    sinkIsOccupied(project, target)
  ) {
    return null;
  }
  return project.bindings.map((binding) =>
    binding.id === source.bindingId
      ? {
          ...binding,
          outputs: {
            ...binding.outputs,
            [source.outputName]: {
              target: { field: target.field, sectionId: target.sectionId },
            },
          },
        }
      : binding,
  );
}

function connectBindings(
  project: Project,
  connection: WorkspaceGraphConnection,
): Binding[] | null {
  const meanings = connectionMeanings(project, connection);
  if (meanings === null) {
    return null;
  }
  const { source, target } = meanings;
  if (source.kind === "event" && target.kind === "handlerTrigger") {
    return connectEventTrigger(project, source, target);
  }
  if (source.kind === "handlerOutput" && target.kind === "handlerInput") {
    return connectJoinInput(project, source, target);
  }
  return source.kind === "handlerOutput" && target.kind === "sink"
    ? connectDisplayTarget(project, source, target)
    : null;
}

function bindingRootKey(project: Project, bindingId: string): string | null {
  const root = bindingRoot(project, bindingId);
  return root === null ? null : JSON.stringify([root.sectionId, root.event]);
}

function bindingRoot(
  project: Project,
  bindingId: string,
  visiting: ReadonlySet<string> = new Set(),
): PipelineRoot | null {
  if (visiting.has(bindingId)) {
    return null;
  }
  const binding = project.bindings.find(
    (candidate) => candidate.id === bindingId,
  );
  if (binding === undefined || binding.trigger.kind === "disconnected") {
    return null;
  }
  if (binding.trigger.kind === "event") {
    return {
      event: binding.trigger.event,
      sectionId: binding.trigger.sectionId,
    };
  }
  const nextVisiting = new Set(visiting).add(bindingId);
  const roots = Object.values(binding.trigger.inputs).map((input) =>
    bindingRoot(project, input.bindingId, nextVisiting),
  );
  const root = roots[0] ?? null;
  return root !== null &&
    roots.every(
      (candidate) =>
        candidate?.sectionId === root.sectionId &&
        candidate.event === root.event,
    )
    ? root
    : null;
}

export function realtimeAutomaticStartupSource(
  project: Project,
  bindingId: string,
): { event: "change" | "snapshot"; sectionId: string } | null {
  const root = bindingRoot(project, bindingId);
  return root?.event === "change" || root?.event === "snapshot"
    ? { event: root.event, sectionId: root.sectionId }
    : null;
}

function wouldCreateCycle(
  project: Project,
  sourceBindingId: string,
  targetBindingId: string,
): boolean {
  const consumers = new Map<string, string[]>();
  for (const binding of project.bindings) {
    if (binding.trigger.kind !== "join") {
      continue;
    }
    for (const input of Object.values(binding.trigger.inputs)) {
      consumers.set(input.bindingId, [
        ...(consumers.get(input.bindingId) ?? []),
        binding.id,
      ]);
    }
  }
  const pending = [targetBindingId];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const bindingId = pending.pop()!;
    if (bindingId === sourceBindingId) {
      return true;
    }
    if (visited.has(bindingId)) {
      continue;
    }
    visited.add(bindingId);
    pending.push(...(consumers.get(bindingId) ?? []));
  }
  return false;
}

function bindingOperations(
  current: Binding[],
  next: Binding[] | null,
): ProjectOperation[] {
  if (next === null) {
    return [];
  }
  return next.flatMap((binding, index) =>
    binding === current[index] ? [] : [{ binding, op: "setBinding" as const }],
  );
}

export function setRealtimeBindingOperations(
  project: Project,
  nextBinding: Binding,
): ProjectOperation[] {
  const previous = project.bindings.find(
    (binding) => binding.id === nextBinding.id,
  );
  if (previous === undefined) {
    return [];
  }
  const removedOutputNames = new Set(
    Object.keys(previous.outputs).filter(
      (outputName) => nextBinding.outputs[outputName] === undefined,
    ),
  );
  const replaced = project.bindings.map((binding) =>
    binding.id === nextBinding.id ? nextBinding : binding,
  );
  const next =
    removedOutputNames.size === 0
      ? replaced
      : pruneRemovedProducerOutputs(
          replaced,
          nextBinding.id,
          removedOutputNames,
        );
  return bindingOperations(project.bindings, next);
}

export function canConnectRealtimeGraph(
  project: Project,
  connection: WorkspaceGraphConnection,
): boolean {
  return connectBindings(project, connection) !== null;
}

export function connectRealtimeGraphOperations(
  project: Project,
  connection: WorkspaceGraphConnection,
): ProjectOperation[] {
  return bindingOperations(
    project.bindings,
    connectBindings(project, connection),
  );
}

export function deleteRealtimeGraphOperations(
  project: Project,
  edgeIds: ReadonlyArray<string>,
): ProjectOperation[] {
  let bindings = project.bindings;
  for (const edgeId of edgeIds) {
    const next = detachEdge({ ...project, bindings }, edgeId);
    if (next !== null) {
      bindings = next;
    }
  }
  return bindingOperations(project.bindings, bindings);
}

export function reconnectRealtimeGraphOperations(
  project: Project,
  reconnect: WorkspaceGraphReconnect,
): ProjectOperation[] {
  const detached = detachEdge(project, reconnect.edgeId);
  if (detached === null) {
    return [];
  }
  return bindingOperations(
    project.bindings,
    connectBindings({ ...project, bindings: detached }, reconnect.connection),
  );
}
