import { useWebsocketConnectionList } from "state/stores/ephemeralUiStores";
import { WebsocketConnectionInfo } from "utils/generatedTypes";

export function setWebsocketConnections(
  connections: Array<WebsocketConnectionInfo>,
) {
  useWebsocketConnectionList.setState({ connections });
}

export function addWebsocketConnection(connection: WebsocketConnectionInfo) {
  useWebsocketConnectionList.setState((state) => {
    for (const c of state.connections) {
      if (c.id === connection.id) {
        return {};
      }
    }
    return { connections: [...state.connections, connection] };
  });
}

export function clearAllWebsocketConnections() {
  useWebsocketConnectionList.getState().reset();
}
