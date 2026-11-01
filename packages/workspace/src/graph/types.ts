export const WORKSPACE_GRAPH_PORT_FAMILIES = [
  "data",
  "agentic",
  "workflow",
] as const;

export type WorkspaceGraphPortFamily =
  (typeof WORKSPACE_GRAPH_PORT_FAMILIES)[number];

export const WORKSPACE_GRAPH_PORT_TYPES = ["source", "target"] as const;

export type WorkspaceGraphPortType =
  (typeof WORKSPACE_GRAPH_PORT_TYPES)[number];

export const WORKSPACE_GRAPH_PORT_SIDES = ["left", "right"] as const;

export type WorkspaceGraphPortSide =
  (typeof WORKSPACE_GRAPH_PORT_SIDES)[number];

export const WORKSPACE_GRAPH_EDGE_STATUSES = [
  "idle",
  "running",
  "missing",
] as const;

export type WorkspaceGraphEdgeStatus =
  (typeof WORKSPACE_GRAPH_EDGE_STATUSES)[number];

export type WorkspaceGraphPort = Readonly<{
  disabled?: boolean;
  family: WorkspaceGraphPortFamily;
  id: string;
  label: string;
  position?: number;
  sectionId: string;
  side?: WorkspaceGraphPortSide;
  type: WorkspaceGraphPortType;
}>;

export type WorkspaceGraphPortReference = Readonly<{
  portId: string;
  sectionId: string;
}>;

export type WorkspaceGraphConnection = Readonly<{
  family: WorkspaceGraphPortFamily;
  source: WorkspaceGraphPortReference;
  target: WorkspaceGraphPortReference;
}>;

export type WorkspaceGraphEdge = Readonly<{
  family: WorkspaceGraphPortFamily;
  hidden?: boolean;
  id: string;
  label?: string;
  source: WorkspaceGraphPortReference;
  status?: WorkspaceGraphEdgeStatus;
  target: WorkspaceGraphPortReference;
}>;

export type WorkspaceGraphReconnect = Readonly<{
  connection: WorkspaceGraphConnection;
  edgeId: string;
}>;

export type WorkspaceGraphConnectionValidator = (
  connection: WorkspaceGraphConnection,
) => boolean;

export type WorkspaceGraphReconnectValidator = (
  reconnect: WorkspaceGraphReconnect,
) => boolean;

export type WorkspaceGraphConfiguration = Readonly<{
  canConnect: WorkspaceGraphConnectionValidator;
  canReconnect?: WorkspaceGraphReconnectValidator;
  edges: ReadonlyArray<WorkspaceGraphEdge>;
  onConnect?: (connection: WorkspaceGraphConnection) => void;
  onDelete?: (edgeIds: ReadonlyArray<string>) => void;
  onReconnect?: (reconnect: WorkspaceGraphReconnect) => void;
  onSelectedEdgeIdsChange?: (edgeIds: ReadonlySet<string>) => void;
  ports: ReadonlyArray<WorkspaceGraphPort>;
  selectedEdgeIds: ReadonlySet<string>;
}>;
