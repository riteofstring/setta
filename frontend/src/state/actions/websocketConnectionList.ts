import { useWebsocketConnectionList } from "state/definitions";
import { Connection, ConnectionTypeEnum } from "utils/generatedTypes";

export function setWebsocketConnections(connections: Array<Connection>) {
  useWebsocketConnectionList.setState((state) => {
    const mergedConnections = [...connections];
    for (const existingConnection of state.connections) {
      if (existingConnection.connectionType !== ConnectionTypeEnum.SERVER) {
        continue;
      }
      let alreadyIncluded = false;
      for (const nextConnection of mergedConnections) {
        if (nextConnection.id === existingConnection.id) {
          alreadyIncluded = true;
          break;
        }
      }
      if (!alreadyIncluded) {
        mergedConnections.unshift(existingConnection);
      }
    }
    return { connections: mergedConnections };
  });
}

export function addWebsocketConnection(connection: Connection) {
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
