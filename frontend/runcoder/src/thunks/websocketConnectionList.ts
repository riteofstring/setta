import { useWebsocketConnectionList } from "models/websocket";

export function updateConnectedTo(message) {
  const { connections } = message;
  const cliConnections = connections.filter((x) => x.isCLI);
  const s = useWebsocketConnectionList.getState();
  if (!cliConnections.map((x) => x.websocketId).includes(s.connectedTo)) {
    if (cliConnections.length > 0) {
      s.setConnectedTo(cliConnections[0].websocketId);
    } else {
      s.setConnectedTo(null);
    }
  }
  s.setConnections(connections);
}
