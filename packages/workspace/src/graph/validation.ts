import type { WorkspaceSection } from "../document/types.js";
import {
  WORKSPACE_GRAPH_EDGE_PATTERNS,
  WORKSPACE_GRAPH_EDGE_STATUSES,
  WORKSPACE_GRAPH_PORT_SIDES,
  WORKSPACE_GRAPH_PORT_TYPES,
  type WorkspaceGraphConfiguration,
  type WorkspaceGraphConnection,
  type WorkspaceGraphEdge,
  type WorkspaceGraphEdgeStatus,
  type WorkspaceGraphFamily,
  type WorkspaceGraphPort,
  type WorkspaceGraphPortReference,
  type WorkspaceGraphPortSide,
  type WorkspaceGraphPortType,
} from "./types.js";

type WorkspaceGraphSnapshot = Readonly<{
  canConnect: WorkspaceGraphConfiguration["canConnect"];
  canReconnect: WorkspaceGraphConfiguration["canReconnect"];
  edges: ReadonlyArray<WorkspaceGraphEdge>;
  edgesById: ReadonlyMap<string, WorkspaceGraphEdge>;
  families: ReadonlyMap<string, WorkspaceGraphFamily>;
  onConnect: WorkspaceGraphConfiguration["onConnect"];
  onDelete: WorkspaceGraphConfiguration["onDelete"];
  onReconnect: WorkspaceGraphConfiguration["onReconnect"];
  onSelectedEdgeIdsChange: WorkspaceGraphConfiguration["onSelectedEdgeIdsChange"];
  ports: ReadonlyArray<WorkspaceGraphPort>;
  portsById: ReadonlyMap<string, WorkspaceGraphPort>;
  portsBySectionId: ReadonlyMap<string, ReadonlyArray<WorkspaceGraphPort>>;
  selectedEdgeIds: ReadonlySet<string>;
}>;

type WorkspaceGraphConnectionEvaluation = Readonly<{
  connection: WorkspaceGraphConnection | null;
  valid: boolean;
}>;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isOneOf<Value extends string>(
  value: unknown,
  choices: ReadonlyArray<Value>,
): value is Value {
  return typeof value === "string" && choices.includes(value as Value);
}

function assertNonEmptyString(
  value: unknown,
  role: string,
): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${role} must be a non-empty string.`);
  }
}

function assertOptionalBoolean(value: unknown, role: string): void {
  if (value !== undefined && typeof value !== "boolean") {
    throw new Error(`${role} must be a boolean when provided.`);
  }
}

function assertOptionalFunction(value: unknown, role: string): void {
  if (value !== undefined && typeof value !== "function") {
    throw new Error(`${role} must be a function when provided.`);
  }
}

function assertPortType(
  value: unknown,
  role: string,
): asserts value is WorkspaceGraphPortType {
  if (!isOneOf(value, WORKSPACE_GRAPH_PORT_TYPES)) {
    throw new Error(`${role} must be source or target.`);
  }
}

function assertDeclaredFamily(
  value: unknown,
  role: string,
  families: ReadonlyMap<string, WorkspaceGraphFamily>,
): asserts value is string {
  assertNonEmptyString(value, role);
  if (!families.has(value)) {
    throw new Error(
      `${role} ${JSON.stringify(value)} is not declared in Workspace graph families.`,
    );
  }
}

function freezeFamily(value: unknown, name: string): WorkspaceGraphFamily {
  const role = `Workspace graph family ${JSON.stringify(name)}`;
  if (!isRecord(value)) {
    throw new Error(`${role} must be an object.`);
  }
  assertNonEmptyString(value.color, `${role} color`);
  if (
    value.pattern !== undefined &&
    !isOneOf(value.pattern, WORKSPACE_GRAPH_EDGE_PATTERNS)
  ) {
    throw new Error(`${role} pattern must be solid, dashed, or dotted.`);
  }
  return Object.freeze({
    color: value.color,
    pattern: value.pattern ?? "solid",
  });
}

function assertPortSide(
  value: unknown,
  role: string,
): asserts value is WorkspaceGraphPortSide {
  if (!isOneOf(value, WORKSPACE_GRAPH_PORT_SIDES)) {
    throw new Error(`${role} must be left or right.`);
  }
}

function assertEdgeStatus(
  value: unknown,
  role: string,
): asserts value is WorkspaceGraphEdgeStatus {
  if (!isOneOf(value, WORKSPACE_GRAPH_EDGE_STATUSES)) {
    throw new Error(`${role} must be idle, running, or missing.`);
  }
}

function assertNormalizedPosition(value: unknown, role: string): void {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    throw new Error(`${role} must be a finite number from 0 through 1.`);
  }
}

function assertPortReference(
  value: unknown,
  role: string,
): asserts value is WorkspaceGraphPortReference {
  if (!isRecord(value)) {
    throw new Error(`${role} must be a section and port reference.`);
  }
  assertNonEmptyString(value.sectionId, `${role} sectionId`);
  assertNonEmptyString(value.portId, `${role} portId`);
}

function freezePortReference(
  reference: WorkspaceGraphPortReference,
): WorkspaceGraphPortReference {
  return Object.freeze({
    portId: reference.portId,
    sectionId: reference.sectionId,
  });
}

function freezePort(port: WorkspaceGraphPort): WorkspaceGraphPort {
  return Object.freeze({
    disabled: port.disabled === true,
    family: port.family,
    id: port.id,
    label: port.label,
    position: getWorkspaceGraphPortPosition(port),
    sectionId: port.sectionId,
    side: getWorkspaceGraphPortSide(port),
    type: port.type,
  });
}

function freezeEdge(edge: WorkspaceGraphEdge): WorkspaceGraphEdge {
  return Object.freeze({
    family: edge.family,
    hidden: edge.hidden === true,
    id: edge.id,
    label: edge.label,
    source: freezePortReference(edge.source),
    status: edge.status ?? "idle",
    target: freezePortReference(edge.target),
  });
}

function assertWorkspaceGraphPort(
  value: unknown,
  index: number,
  knownSectionIds: ReadonlySet<string>,
  families: ReadonlyMap<string, WorkspaceGraphFamily>,
): asserts value is WorkspaceGraphPort {
  const role = `Workspace graph port at index ${index}`;
  if (!isRecord(value)) {
    throw new Error(`${role} must be an object.`);
  }
  assertNonEmptyString(value.id, `${role} id`);
  assertNonEmptyString(value.sectionId, `${role} sectionId`);
  if (!knownSectionIds.has(value.sectionId)) {
    throw new Error(
      `${role} references unknown section ${JSON.stringify(value.sectionId)}.`,
    );
  }
  assertPortType(value.type, `${role} type`);
  assertDeclaredFamily(value.family, `${role} family`, families);
  assertNonEmptyString(value.label, `${role} label`);
  assertOptionalBoolean(value.disabled, `${role} disabled`);
  if (value.side !== undefined) {
    assertPortSide(value.side, `${role} side`);
  }
  if (value.position !== undefined) {
    assertNormalizedPosition(value.position, `${role} position`);
  }
}

function assertWorkspaceGraphEdge(
  value: unknown,
  index: number,
  families: ReadonlyMap<string, WorkspaceGraphFamily>,
): asserts value is WorkspaceGraphEdge {
  const role = `Workspace graph edge at index ${index}`;
  if (!isRecord(value)) {
    throw new Error(`${role} must be an object.`);
  }
  assertNonEmptyString(value.id, `${role} id`);
  assertDeclaredFamily(value.family, `${role} family`, families);
  assertPortReference(value.source, `${role} source`);
  assertPortReference(value.target, `${role} target`);
  assertOptionalBoolean(value.hidden, `${role} hidden`);
  if (value.label !== undefined) {
    assertNonEmptyString(value.label, `${role} label`);
  }
  if (value.status !== undefined) {
    assertEdgeStatus(value.status, `${role} status`);
  }
}

function assertWorkspaceGraphConfigurationShape(
  configuration: unknown,
): asserts configuration is WorkspaceGraphConfiguration {
  if (!isRecord(configuration)) {
    throw new Error("Workspace graph configuration must be an object.");
  }
  if (!isRecord(configuration.families)) {
    throw new Error("Workspace graph configuration families must be a record.");
  }
  if (!Array.isArray(configuration.ports)) {
    throw new Error("Workspace graph configuration ports must be an array.");
  }
  if (!Array.isArray(configuration.edges)) {
    throw new Error("Workspace graph configuration edges must be an array.");
  }
  if (!(configuration.selectedEdgeIds instanceof Set)) {
    throw new Error(
      "Workspace graph configuration selectedEdgeIds must be a ReadonlySet.",
    );
  }
  if (typeof configuration.canConnect !== "function") {
    throw new Error(
      "Workspace graph configuration canConnect must be a synchronous function.",
    );
  }
  assertOptionalFunction(
    configuration.canReconnect,
    "Workspace graph canReconnect",
  );
  assertOptionalFunction(configuration.onConnect, "Workspace graph onConnect");
  assertOptionalFunction(
    configuration.onReconnect,
    "Workspace graph onReconnect",
  );
  assertOptionalFunction(
    configuration.onSelectedEdgeIdsChange,
    "Workspace graph onSelectedEdgeIdsChange",
  );
  assertOptionalFunction(configuration.onDelete, "Workspace graph onDelete");
}

function assertEdgeEndpoint(
  edge: WorkspaceGraphEdge,
  role: "source" | "target",
  portsById: ReadonlyMap<string, WorkspaceGraphPort>,
): void {
  const endpoint = edge[role];
  const port = portsById.get(endpoint.portId);
  if (!port) {
    throw new Error(
      `Workspace graph edge ${JSON.stringify(edge.id)} ${role} references unknown port ${JSON.stringify(endpoint.portId)}.`,
    );
  }
  if (port.sectionId !== endpoint.sectionId) {
    throw new Error(
      `Workspace graph edge ${JSON.stringify(edge.id)} ${role} port ${JSON.stringify(endpoint.portId)} belongs to section ${JSON.stringify(port.sectionId)}, not ${JSON.stringify(endpoint.sectionId)}.`,
    );
  }
  if (port.type !== role) {
    throw new Error(
      `Workspace graph edge ${JSON.stringify(edge.id)} ${role} port ${JSON.stringify(endpoint.portId)} must be a ${role} port.`,
    );
  }
  if (port.family !== edge.family) {
    throw new Error(
      `Workspace graph edge ${JSON.stringify(edge.id)} family must match its ${role} port ${JSON.stringify(endpoint.portId)}.`,
    );
  }
}

export function getWorkspaceGraphPortSide(
  port: WorkspaceGraphPort,
): WorkspaceGraphPortSide {
  return port.side ?? (port.type === "source" ? "right" : "left");
}

export function getWorkspaceGraphFamilyStyle(
  family: WorkspaceGraphFamily | undefined,
): Record<`--setta-workspace-graph-${string}`, string> | undefined {
  return family && { "--setta-workspace-graph-family-color": family.color };
}

export function getWorkspaceGraphPortPosition(
  port: WorkspaceGraphPort,
): number {
  return port.position ?? 0.5;
}

export function detachWorkspaceGraphConnection(
  connection: WorkspaceGraphConnection,
): WorkspaceGraphConnection {
  return Object.freeze({
    family: connection.family,
    source: freezePortReference(connection.source),
    target: freezePortReference(connection.target),
  });
}

export function createWorkspaceGraphConnection(
  first: WorkspaceGraphPort,
  second: WorkspaceGraphPort,
): WorkspaceGraphConnection | null {
  if (
    first.disabled ||
    second.disabled ||
    first.family !== second.family ||
    first.type === second.type
  ) {
    return null;
  }
  const source = first.type === "source" ? first : second;
  const target = first.type === "target" ? first : second;
  return detachWorkspaceGraphConnection({
    family: source.family,
    source: { portId: source.id, sectionId: source.sectionId },
    target: { portId: target.id, sectionId: target.sectionId },
  });
}

export function validateWorkspaceGraphConfiguration(
  configuration: WorkspaceGraphConfiguration | undefined,
  sections: Readonly<Record<string, WorkspaceSection>>,
): WorkspaceGraphSnapshot | null {
  if (configuration === undefined) {
    return null;
  }
  assertWorkspaceGraphConfigurationShape(configuration);
  const knownSectionIds = new Set(Object.keys(sections));
  const families = new Map(
    Object.entries(configuration.families).map(([name, family]) => [
      name,
      freezeFamily(family, name),
    ]),
  );
  const portsById = new Map<string, WorkspaceGraphPort>();
  const portsBySectionId = new Map<string, Array<WorkspaceGraphPort>>();
  const ports: Array<WorkspaceGraphPort> = [];

  configuration.ports.forEach((port, index) => {
    assertWorkspaceGraphPort(port, index, knownSectionIds, families);
    if (portsById.has(port.id)) {
      throw new Error(
        `Workspace graph has duplicate port id ${JSON.stringify(port.id)}.`,
      );
    }
    const nextPort = freezePort(port);
    ports.push(nextPort);
    portsById.set(nextPort.id, nextPort);
    const sectionPorts = portsBySectionId.get(nextPort.sectionId) ?? [];
    sectionPorts.push(nextPort);
    portsBySectionId.set(nextPort.sectionId, sectionPorts);
  });

  const edgesById = new Map<string, WorkspaceGraphEdge>();
  const edges: Array<WorkspaceGraphEdge> = [];
  configuration.edges.forEach((edge, index) => {
    assertWorkspaceGraphEdge(edge, index, families);
    if (edgesById.has(edge.id)) {
      throw new Error(
        `Workspace graph has duplicate edge id ${JSON.stringify(edge.id)}.`,
      );
    }
    assertEdgeEndpoint(edge, "source", portsById);
    assertEdgeEndpoint(edge, "target", portsById);
    const nextEdge = freezeEdge(edge);
    edges.push(nextEdge);
    edgesById.set(nextEdge.id, nextEdge);
  });

  const selectedEdgeIds = new Set<string>();
  for (const edgeId of configuration.selectedEdgeIds) {
    assertNonEmptyString(edgeId, "Workspace graph selected edge id");
    if (edgesById.has(edgeId)) {
      selectedEdgeIds.add(edgeId);
    }
  }

  return Object.freeze({
    canConnect: configuration.canConnect,
    canReconnect: configuration.canReconnect,
    edges: Object.freeze(edges),
    edgesById,
    families,
    onConnect: configuration.onConnect,
    onDelete: configuration.onDelete,
    onReconnect: configuration.onReconnect,
    onSelectedEdgeIdsChange: configuration.onSelectedEdgeIdsChange,
    ports: Object.freeze(ports),
    portsById,
    portsBySectionId,
    selectedEdgeIds,
  });
}

export function evaluateWorkspaceGraphConnection(
  snapshot: WorkspaceGraphSnapshot,
  firstPortId: string,
  secondPortId: string,
  replacingEdgeId?: string,
): WorkspaceGraphConnectionEvaluation {
  const first = snapshot.portsById.get(firstPortId);
  const second = snapshot.portsById.get(secondPortId);
  if (!first || !second) {
    return Object.freeze({ connection: null, valid: false });
  }
  const connection = createWorkspaceGraphConnection(first, second);
  if (!connection) {
    return Object.freeze({ connection: null, valid: false });
  }
  const detachedConnection = detachWorkspaceGraphConnection(connection);
  const valid =
    replacingEdgeId !== undefined && snapshot.canReconnect !== undefined
      ? snapshot.canReconnect(
          Object.freeze({
            connection: detachedConnection,
            edgeId: replacingEdgeId,
          }),
        )
      : snapshot.canConnect(detachedConnection);
  if (typeof valid !== "boolean") {
    throw new Error(
      `Workspace graph ${
        replacingEdgeId !== undefined && snapshot.canReconnect !== undefined
          ? "canReconnect"
          : "canConnect"
      } must return a boolean.`,
    );
  }
  return Object.freeze({ connection, valid });
}

export type { WorkspaceGraphSnapshot };
