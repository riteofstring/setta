import { Badge } from "components/Utils/atoms/badges/badge";
import { NavbarMenuDropdown } from "components/Utils/atoms/menubar/menudropdown";
import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import _ from "lodash";
import { FaPlug } from "react-icons/fa6";
import { useWebsocketConnectionList } from "state/definitions";
import { C } from "utils/c";

export function WebsocketConnections() {
  const connections = useWebsocketConnectionList((x) => {
    return sortByConnectionType(x.connections);
  }, _.isEqual);

  const noServerConnections =
    connections.filter(
      (x) => x.connectionType === C.WEBSOCKET_CONNECTION_TYPE_SERVER,
    ).length === 0;

  const triggerClassName = `nodrag flex cursor-pointer select-none items-center justify-between gap-1 rounded-md py-1 px-2 text-xs font-semibold leading-none text-setta-700 outline-none transition-colors duration-150 hover:bg-setta-100 focus-visible:ring-2 dark:text-setta-200 ${noServerConnections ? "bg-red-800 dark:hover:bg-red-800" : "dark:hover:bg-setta-800"}`;

  return (
    <NavbarMenuDropdown
      trigger={<FaPlug />}
      triggerClassName={triggerClassName}
    >
      <ConnectionList connections={connections} />
    </NavbarMenuDropdown>
  );
}

function ConnectionList({ connections }) {
  return connections.length > 0 ? (
    connections.map((x) => <ConnectionItem info={x} key={x.websocketId} />)
  ) : (
    <MenuItem>No connections</MenuItem>
  );
}

function ConnectionItem({ info }) {
  const twClasses =
    info.connectionType === C.WEBSOCKET_CONNECTION_TYPE_SERVER
      ? "bg-green-100 dark:bg-green-800 text-green-800 dark:text-green-100"
      : "bg-grey-100 dark:bg-grey-800 text-grey-800 dark:text-grey-100";

  return (
    <MenuItem>
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
