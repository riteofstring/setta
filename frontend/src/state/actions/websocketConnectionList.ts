import { useWebsocketConnectionList } from "state/definitions";

export function setWebsocketConnections(connections) {
  useWebsocketConnectionList.setState({ connections });
}

export function addWebsocketConnection(connection) {
  useWebsocketConnectionList.setState((state) => {
    for (const c of state.connections) {
      if (c.websocketId === connection.websocketId) {
        return {};
      }
    }
    return { connections: [...state.connections, connection] };
  });
}

export function clearAllWebsocketConnections() {
  useWebsocketConnectionList.getState().reset();
}
