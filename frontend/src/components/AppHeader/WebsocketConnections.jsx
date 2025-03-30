import { Badge } from "components/Utils/atoms/badges/badge";
import { NavbarMenuDropdown } from "components/Utils/atoms/menubar/menudropdown";
import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import C from "constants/constants.json";
import _ from "lodash";
import {
  canReceiveCommands,
  setWebsocketConnectedTo,
} from "state/actions/websocketConnectionList";
import { useWebsocketConnectionList } from "state/definitions";

export function WebsocketConnections() {
  return (
    <NavbarMenuDropdown trigger="CLI">
      <ConnectionList />
    </NavbarMenuDropdown>
  );
}

function ConnectionList() {
  const { connectedTo, connections } = useWebsocketConnectionList((x) => {
    return {
      connectedTo: x.connectedTo,
      connections: sortByConnectionType(x.connections),
    };
  }, _.isEqual);

  return connections.length > 0 ? (
    connections.map((x) => (
      <ConnectionItem info={x} key={x.websocketId} connectedTo={connectedTo} />
    ))
  ) : (
    <MenuItem>No CLI connections</MenuItem>
  );
}

function ConnectionItem({ info, connectedTo }) {
  const twClasses =
    connectedTo === info.websocketId
      ? "bg-green-100 dark:bg-green-800 text-green-800 dark:text-green-100"
      : "bg-grey-100 dark:bg-grey-800 text-grey-800 dark:text-grey-100";

  return (
    <MenuItem
      onClick={() => setWebsocketConnectedTo(info.websocketId)}
      disabled={!canReceiveCommands(info.connectionType)}
    >
      <Badge twClasses={twClasses}>
        {prettifiedConnectionType[info.connectionType]}
      </Badge>
      {info.websocketId}
    </MenuItem>
  );
}

const prettifiedConnectionType = {
  [C.WEBSOCKET_CONNECTION_TYPE_CLI]: "CLI",
  [C.WEBSOCKET_CONNECTION_TYPE_FRONTEND]: "Frontend",
  [C.WEBSOCKET_CONNECTION_TYPE_PYTHON_LOGGER]: "Logger",
  [C.WEBSOCKET_CONNECTION_TYPE_PYTHON_SCRIPT]: "Script",
  [C.WEBSOCKET_CONNECTION_TYPE_SERVER]: "Server",
};

function sortByConnectionType(list) {
  // Define the order of connection types
  const order = {
    [C.WEBSOCKET_CONNECTION_TYPE_SERVER]: 1,
    [C.WEBSOCKET_CONNECTION_TYPE_CLI]: 2,
    [C.WEBSOCKET_CONNECTION_TYPE_PYTHON_LOGGER]: 3,
    [C.WEBSOCKET_CONNECTION_TYPE_PYTHON_SCRIPT]: 4,
    [C.WEBSOCKET_CONNECTION_TYPE_FRONTEND]: 5,
  };

  // Default value for any connectionType not in the order map
  const defaultOrder = 999;

  // Sort the list based on the connectionType
  return list.sort((a, b) => {
    const orderA = order[a.connectionType] || defaultOrder;
    const orderB = order[b.connectionType] || defaultOrder;
    return orderA - orderB;
  });
}
