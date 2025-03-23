import C from "constants/constants.json";
import { useWebsocketConnectionList } from "state/definitions";

export function updateConnectedTo(connections) {
  const cliConnections = connections.filter(
    (x) =>
      x.connectionType === C.WEBSOCKET_CONNECTION_TYPE_CLI ||
      x.connectionType === C.WEBSOCKET_CONNECTION_TYPE_SERVER,
  );
  if (
    !cliConnections
      .map((x) => x.websocketId)
      .includes(useWebsocketConnectionList.getState().connectedTo)
  ) {
    if (cliConnections.length > 0) {
      setWebsocketConnectedTo(cliConnections[0].websocketId);
    } else {
      setWebsocketConnectedTo(null);
    }
  }
  setWebsocketConnections(connections);
}

export function setWebsocketConnectedTo(connectedTo) {
  useWebsocketConnectionList.setState({ connectedTo });
}

function setWebsocketConnections(connections) {
  useWebsocketConnectionList.setState({ connections });
}
