export type HandleType = "source" | "target";

export enum HandlePosition {
  Left = "left",
  Right = "right",
}

export type Connection = {
  source: string | null;
  target: string | null;
  sourceHandle: string | null;
  targetHandle: string | null;
};

export type ConnectingHandle = {
  sectionId: string;
  type: HandleType;
  handleId: string | null;
};

export type ConnectionStatus = "valid" | "invalid";

export enum ConnectionMode {
  Strict = "strict",
  Loose = "loose",
}

export type HandleProps = {
  type: HandleType;
  position: HandlePosition;
  id?: string;
  isConnectable?: boolean;
  isConnectableStart?: boolean;
  isConnectableEnd?: boolean;
  connectionStartSemanticType?: HandleType;
  isValidConnection?: (connection: Connection) => boolean;
  onConnect?: (connection: Connection) => void;
};
