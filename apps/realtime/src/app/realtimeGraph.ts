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
type OutputField = NonNullable<
  Binding["outputs"][string]["target"]
>["field"];

type PortMeaning =
  | { kind: "event"; event: EventName; sectionId: string }
  | { kind: "handlerTrigger"; bindingId: string }
  | { kind: "handlerInput"; bindingId: string; inputName: string }
  | { kind: "handlerOutput"; bindingId: string; outputName: string }
  | { kind: "sink"; field: OutputField; sectionId: string };

export type RealtimeGraphProjection = {
  edges: WorkspaceGraphEdge[];
  ports: WorkspaceGraphPort[];
};

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

function port(
  family: WorkspaceGraphPort["family"],
  id: string,
  label: string,
  sectionId: string,
  type: WorkspaceGraphPort["type"],
  position: number,
): WorkspaceGraphPort {
  return { family, id, label, position, sectionId, type };
}

function distributedPosition(index: number, count: number): number {
  return (index + 1) / (count + 1);
}

export function projectRealtimeGraph(
  project: Project,
  visibleSectionIds: ReadonlySet<string> = new Set(
    Object.keys(project.sections),
  ),
): RealtimeGraphProjection {
  const edges: WorkspaceGraphEdge[] = [];
  const ports: WorkspaceGraphPort[] = [];
  const sectionsByBinding = handlerSections(project, visibleSectionIds);
  const bindingsById = new Map(
    project.bindings.map((binding) => [binding.id, binding]),
  );

  for (const section of Object.values(project.sections).sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    if (!visibleSectionIds.has(section.id)) {
      continue;
    }
    const events = sectionEvents(section);
    events.forEach((event, index) =>
      ports.push(
        port(
          "workflow",
          eventPortId(section.id, event),
          event,
          section.id,
          "source",
          distributedPosition(index, events.length),
        ),
      ),
    );
    const sinks = sectionSinks(section);
    sinks.forEach((field, index) =>
      ports.push(
        port(
          "data",
          sinkPortId(section.id, field),
          field,
          section.id,
          "target",
          distributedPosition(index, sinks.length),
        ),
      ),
    );
  }

  for (const binding of [...project.bindings].sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    const section = sectionsByBinding.get(binding.id);
    if (section === undefined) {
      continue;
    }
    ports.push(
      port(
        "workflow",
        triggerPortId(binding.id),
        "trigger",
        section.id,
        "target",
        0.16,
      ),
    );
    const joinInputs =
      binding.trigger.kind === "join"
        ? Object.keys(binding.trigger.inputs)
        : [];
    const inputNames = [...new Set([
      ...Object.keys(binding.arguments),
      ...joinInputs,
    ])].sort();
    inputNames.forEach((inputName, index) =>
      ports.push(
        port(
          "data",
          inputPortId(binding.id, inputName),
          inputName,
          section.id,
          "target",
          distributedPosition(index, inputNames.length),
        ),
      ),
    );
    const outputNames = Object.keys(binding.outputs).sort();
    outputNames.forEach((outputName, index) =>
      ports.push(
        port(
          "data",
          outputPortId(binding.id, outputName),
          outputName,
          section.id,
          "source",
          distributedPosition(index, outputNames.length),
        ),
      ),
    );

    if (
      binding.trigger.kind === "event" &&
      visibleSectionIds.has(binding.trigger.sectionId)
    ) {
      edges.push({
        family: "workflow",
        id: triggerEdgeId(binding.id),
        source: {
          portId: eventPortId(
            binding.trigger.sectionId,
            binding.trigger.event,
          ),
          sectionId: binding.trigger.sectionId,
        },
        target: { portId: triggerPortId(binding.id), sectionId: section.id },
      });
    }
    if (binding.trigger.kind === "join") {
      for (const [inputName, input] of Object.entries(
        binding.trigger.inputs,
      ).sort(([left], [right]) => left.localeCompare(right))) {
        const producerSection = sectionsByBinding.get(input.bindingId);
        const producer = bindingsById.get(input.bindingId);
        if (
          producerSection === undefined ||
          producer?.outputs[input.output] === undefined
        ) {
          continue;
        }
        edges.push({
          family: "data",
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
        });
      }
    }
    for (const [outputName, output] of Object.entries(binding.outputs).sort(
      ([left], [right]) => left.localeCompare(right),
    )) {
      if (
        output.target === undefined ||
        !visibleSectionIds.has(output.target.sectionId)
      ) {
        continue;
      }
      edges.push({
        family: "data",
        id: displayEdgeId(binding.id, outputName),
        label: outputName,
        source: {
          portId: outputPortId(binding.id, outputName),
          sectionId: section.id,
        },
        target: {
          portId: sinkPortId(output.target.sectionId, output.target.field),
          sectionId: output.target.sectionId,
        },
      });
    }
  }

  return { edges, ports };
}

function meaningForPort(project: Project, portId: string): PortMeaning | null {
  const sectionsByBinding = handlerSections(project);
  for (const section of Object.values(project.sections)) {
    for (const event of sectionEvents(section)) {
      if (eventPortId(section.id, event) === portId) {
        return { event, kind: "event", sectionId: section.id };
      }
    }
    for (const field of sectionSinks(section)) {
      if (sinkPortId(section.id, field) === portId) {
        return { field, kind: "sink", sectionId: section.id };
      }
    }
  }
  for (const binding of project.bindings) {
    if (!sectionsByBinding.has(binding.id)) {
      continue;
    }
    if (triggerPortId(binding.id) === portId) {
      return { bindingId: binding.id, kind: "handlerTrigger" };
    }
    const joinInputs =
      binding.trigger.kind === "join"
        ? Object.keys(binding.trigger.inputs)
        : [];
    for (const inputName of new Set([
      ...Object.keys(binding.arguments),
      ...joinInputs,
    ])) {
      if (inputPortId(binding.id, inputName) === portId) {
        return { bindingId: binding.id, inputName, kind: "handlerInput" };
      }
    }
    for (const outputName of Object.keys(binding.outputs)) {
      if (outputPortId(binding.id, outputName) === portId) {
        return { bindingId: binding.id, kind: "handlerOutput", outputName };
      }
    }
  }
  return null;
}

function disconnectedBinding(binding: Binding): Binding {
  return {
    ...binding,
    materialization:
      binding.materialization === undefined
        ? undefined
        : { ...binding.materialization, startup: "manual" },
    trigger: { kind: "disconnected" },
  };
}

function detachEdge(project: Project, edgeId: string): Binding[] | null {
  const next = project.bindings.map((binding) => {
    if (triggerEdgeId(binding.id) === edgeId) {
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
        return Object.keys(inputs).length === 0
          ? disconnectedBinding(nextBinding)
          : {
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
  return next.some((binding, index) => binding !== project.bindings[index])
    ? next
    : null;
}

function connectBindings(
  project: Project,
  connection: WorkspaceGraphConnection,
): Binding[] | null {
  const graph = projectRealtimeGraph(project);
  const sourcePort = graph.ports.find(
    (candidate) => candidate.id === connection.source.portId,
  );
  const targetPort = graph.ports.find(
    (candidate) => candidate.id === connection.target.portId,
  );
  if (
    sourcePort === undefined ||
    targetPort === undefined ||
    sourcePort.type !== "source" ||
    targetPort.type !== "target" ||
    sourcePort.sectionId !== connection.source.sectionId ||
    targetPort.sectionId !== connection.target.sectionId ||
    sourcePort.family !== connection.family ||
    targetPort.family !== connection.family ||
    graph.edges.some(
      (edge) =>
        edge.target.sectionId === connection.target.sectionId &&
        edge.target.portId === connection.target.portId,
    )
  ) {
    return null;
  }
  const source = meaningForPort(project, connection.source.portId);
  const target = meaningForPort(project, connection.target.portId);
  if (source?.kind === "event" && target?.kind === "handlerTrigger") {
    return project.bindings.map((binding) => {
      if (binding.id !== target.bindingId) {
        return binding;
      }
      const argumentsWithFormerInputs = { ...binding.arguments };
      if (binding.trigger.kind === "join") {
        for (const inputName of Object.keys(binding.trigger.inputs)) {
          argumentsWithFormerInputs[inputName] = null;
        }
      }
      return {
        ...binding,
        arguments: argumentsWithFormerInputs,
        trigger: {
          event: source.event,
          kind: "event" as const,
          sectionId: source.sectionId,
        },
      };
    });
  }
  if (
    source?.kind === "handlerOutput" &&
    target?.kind === "handlerInput" &&
    source.bindingId !== target.bindingId &&
    !wouldCreateCycle(project, source.bindingId, target.bindingId)
  ) {
    return project.bindings.map((binding) => {
      if (binding.id !== target.bindingId) {
        return binding;
      }
      const argumentsWithoutInput = { ...binding.arguments };
      delete argumentsWithoutInput[target.inputName];
      return {
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
          kind: "join" as const,
          mode: "all" as const,
        },
      };
    });
  }
  if (source?.kind === "handlerOutput" && target?.kind === "sink") {
    const occupied = project.bindings.some((binding) =>
      Object.values(binding.outputs).some(
        (output) =>
          output.target?.sectionId === target.sectionId &&
          output.target.field === target.field,
      ),
    );
    if (occupied) {
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
  return null;
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
