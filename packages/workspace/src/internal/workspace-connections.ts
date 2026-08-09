import { denseArrayAt, optionOverridesAt } from "./runtime-option-validation.js";
import type { WorkspaceDocument, WorkspacePoint } from "./workspace-document-contract.js";
import { validateWorkspaceDocument } from "./workspace-document-validation.js";

export const WORKSPACE_CONNECTIONS_SCHEMA_VERSION = 1 as const;

export type WorkspacePortSide = "bottom" | "left" | "right" | "top";

export type WorkspacePort = Readonly<{
  id: string;
  label: string;
  offset: number;
  sectionId: string;
  side: WorkspacePortSide;
}>;

export type WorkspaceEdgeEndpoint = Readonly<{
  portId: string;
  sectionId: string;
}>;

export type WorkspaceEdge = Readonly<{
  directed: boolean;
  id: string;
  label: string;
  source: WorkspaceEdgeEndpoint;
  target: WorkspaceEdgeEndpoint;
}>;

export type WorkspaceConnections = Readonly<{
  edges: readonly WorkspaceEdge[];
  ports: readonly WorkspacePort[];
  schemaVersion: typeof WORKSPACE_CONNECTIONS_SCHEMA_VERSION;
}>;

export type WorkspaceConnectionRect = WorkspacePoint &
  Readonly<{
    height: number;
    width: number;
  }>;

const connectionKeys = ["edges", "ports", "schemaVersion"] as const;
const edgeKeys = ["directed", "id", "label", "source", "target"] as const;
const endpointKeys = ["portId", "sectionId"] as const;
const portKeys = ["id", "label", "offset", "sectionId", "side"] as const;
const portSides = new Set<WorkspacePortSide>(["bottom", "left", "right", "top"]);

function requiredField(
  record: Readonly<Record<string, unknown>>,
  key: string,
  label: string,
): unknown {
  if (!Object.hasOwn(record, key)) {
    throw new TypeError(`${label} must provide ${key}.`);
  }
  return record[key];
}

function trimmedText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  if (value !== value.trim()) {
    throw new TypeError(`${label} must not start or end with whitespace.`);
  }
  return value;
}

function validatePort(value: unknown, index: number): WorkspacePort {
  const label = `Workspace port at index ${String(index)}`;
  const record = optionOverridesAt(value, portKeys, label, "workspace port field");
  const side = requiredField(record, "side", label);
  const offset = requiredField(record, "offset", label);
  if (!portSides.has(side as WorkspacePortSide)) {
    throw new TypeError(`${label} side must be bottom, left, right, or top.`);
  }
  if (typeof offset !== "number" || !Number.isFinite(offset) || offset < 0 || offset > 1) {
    throw new TypeError(`${label} offset must be a finite number from 0 through 1.`);
  }
  return {
    id: trimmedText(requiredField(record, "id", label), `${label} id`),
    label: trimmedText(requiredField(record, "label", label), `${label} label`),
    offset,
    sectionId: trimmedText(requiredField(record, "sectionId", label), `${label} sectionId`),
    side: side as WorkspacePortSide,
  };
}

function validateEndpoint(value: unknown, label: string): WorkspaceEdgeEndpoint {
  const record = optionOverridesAt(value, endpointKeys, label, "workspace edge endpoint field");
  return {
    portId: trimmedText(requiredField(record, "portId", label), `${label} portId`),
    sectionId: trimmedText(requiredField(record, "sectionId", label), `${label} sectionId`),
  };
}

function validateEdge(value: unknown, index: number): WorkspaceEdge {
  const label = `Workspace edge at index ${String(index)}`;
  const record = optionOverridesAt(value, edgeKeys, label, "workspace edge field");
  const directed = requiredField(record, "directed", label);
  if (typeof directed !== "boolean") {
    throw new TypeError(`${label} directed must be a boolean.`);
  }
  return {
    directed,
    id: trimmedText(requiredField(record, "id", label), `${label} id`),
    label: trimmedText(requiredField(record, "label", label), `${label} label`),
    source: validateEndpoint(requiredField(record, "source", label), `${label} source`),
    target: validateEndpoint(requiredField(record, "target", label), `${label} target`),
  };
}

function portKey(endpoint: WorkspaceEdgeEndpoint): string {
  return `${JSON.stringify(endpoint.sectionId)}:${JSON.stringify(endpoint.portId)}`;
}

function validateReferences(
  document: WorkspaceDocument<unknown>,
  ports: readonly WorkspacePort[],
  edges: readonly WorkspaceEdge[],
): void {
  const portsByKey = new Map<string, WorkspacePort>();
  for (const port of ports) {
    if (!Object.hasOwn(document.sections, port.sectionId)) {
      throw new TypeError(
        `Workspace port ${JSON.stringify(port.id)} references an unknown section.`,
      );
    }
    const key = portKey({ portId: port.id, sectionId: port.sectionId });
    if (portsByKey.has(key)) {
      throw new TypeError(
        `Workspace port ${JSON.stringify(port.id)} is duplicated in section ${JSON.stringify(port.sectionId)}.`,
      );
    }
    portsByKey.set(key, port);
  }
  const edgeIds = new Set<string>();
  for (const edge of edges) {
    if (edgeIds.has(edge.id)) {
      throw new TypeError(`Workspace edge id ${JSON.stringify(edge.id)} is duplicated.`);
    }
    edgeIds.add(edge.id);
    for (const [kind, endpoint] of [
      ["source", edge.source],
      ["target", edge.target],
    ] as const) {
      if (!portsByKey.has(portKey(endpoint))) {
        throw new TypeError(
          `Workspace edge ${JSON.stringify(edge.id)} ${kind} references an unknown port.`,
        );
      }
    }
    if (portKey(edge.source) === portKey(edge.target)) {
      throw new TypeError(
        `Workspace edge ${JSON.stringify(edge.id)} source and target must be different ports.`,
      );
    }
  }
}

export function validateWorkspaceConnections(
  document: WorkspaceDocument<unknown>,
  value: unknown,
): asserts value is WorkspaceConnections {
  validateWorkspaceDocument(document);
  const record = optionOverridesAt(
    value,
    connectionKeys,
    "Workspace connections",
    "workspace connections field",
  );
  const schemaVersion = requiredField(record, "schemaVersion", "Workspace connections");
  if (schemaVersion !== WORKSPACE_CONNECTIONS_SCHEMA_VERSION) {
    throw new TypeError("Workspace connections use an unsupported schema version.");
  }
  const ports = denseArrayAt(
    requiredField(record, "ports", "Workspace connections"),
    "Workspace ports",
  ).map(validatePort);
  const edges = denseArrayAt(
    requiredField(record, "edges", "Workspace connections"),
    "Workspace edges",
  ).map(validateEdge);
  validateReferences(document, ports, edges);
}

function immutableConnections(connections: WorkspaceConnections): WorkspaceConnections {
  return Object.freeze({
    edges: Object.freeze(
      connections.edges.map((edge) =>
        Object.freeze({
          ...edge,
          source: Object.freeze({ ...edge.source }),
          target: Object.freeze({ ...edge.target }),
        }),
      ),
    ),
    ports: Object.freeze(connections.ports.map((port) => Object.freeze({ ...port }))),
    schemaVersion: WORKSPACE_CONNECTIONS_SCHEMA_VERSION,
  });
}

export function createEmptyWorkspaceConnections(): WorkspaceConnections {
  return Object.freeze({
    edges: Object.freeze([]),
    ports: Object.freeze([]),
    schemaVersion: WORKSPACE_CONNECTIONS_SCHEMA_VERSION,
  });
}

export function parseWorkspaceConnections(
  document: WorkspaceDocument<unknown>,
  serialized: string,
): WorkspaceConnections {
  if (typeof serialized !== "string") {
    throw new TypeError("Serialized workspace connections must be a string.");
  }
  let value: unknown;
  try {
    value = JSON.parse(serialized) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new TypeError("Workspace connections must contain valid JSON.", { cause: error });
    }
    throw error;
  }
  validateWorkspaceConnections(document, value);
  return immutableConnections(value);
}

export function serializeWorkspaceConnections(
  document: WorkspaceDocument<unknown>,
  connections: WorkspaceConnections,
): string {
  validateWorkspaceConnections(document, connections);
  return JSON.stringify(connections);
}

function assertConnectionRect(rect: WorkspaceConnectionRect): void {
  if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) {
    throw new TypeError(
      "Workspace connection rectangle must contain finite non-negative geometry.",
    );
  }
  if (rect.width < 0 || rect.height < 0) {
    throw new TypeError(
      "Workspace connection rectangle must contain finite non-negative geometry.",
    );
  }
}

function assertPortPlacement(port: Pick<WorkspacePort, "offset" | "side">): void {
  if (!Number.isFinite(port.offset) || port.offset < 0 || port.offset > 1) {
    throw new TypeError("Workspace port offset must be a finite number from 0 through 1.");
  }
  if (!portSides.has(port.side)) {
    throw new TypeError("Workspace port side must be bottom, left, right, or top.");
  }
}

export function resolveWorkspacePortPosition(
  rect: WorkspaceConnectionRect,
  port: Pick<WorkspacePort, "offset" | "side">,
): WorkspacePoint {
  assertConnectionRect(rect);
  assertPortPlacement(port);
  if (port.side === "bottom" || port.side === "top") {
    return {
      x: rect.x + rect.width * port.offset,
      y: port.side === "top" ? rect.y : rect.y + rect.height,
    };
  }
  return {
    x: port.side === "left" ? rect.x : rect.x + rect.width,
    y: rect.y + rect.height * port.offset,
  };
}
