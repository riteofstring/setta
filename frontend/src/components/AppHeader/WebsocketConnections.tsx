import { NavbarMenuDropdown } from "components/Utils/atoms/menubar/menudropdown";
import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import _ from "lodash";
import { FaPlug } from "react-icons/fa6";
import { useWebsocketConnectionList } from "state/definitions";
import {
  WebsocketConnectionInfo,
  WebsocketConnectionTypeEnum,
} from "utils/generatedTypes";

export function WebsocketConnections() {
  const connections = useWebsocketConnectionList((x) => {
    return sortByConnectionType(x.connections);
  }, _.isEqual);

  const noServerConnections =
    connections.filter(
      (x) => x.connectionType === WebsocketConnectionTypeEnum.SERVER,
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

type ComponentConnectionListType = {
  connections: Array<WebsocketConnectionInfo>;
};

function ConnectionList({ connections }: ComponentConnectionListType) {
  return connections.length > 0 ? (
    connections.map((x) => <ConnectionItem info={x} key={x.id} />)
  ) : (
    <MenuItem>No connections</MenuItem>
  );
}

type ComponentConnectionItemType = {
  info: WebsocketConnectionInfo;
};

function ConnectionItem({ info }: ComponentConnectionItemType) {
  const colors =
    info.connectionType === WebsocketConnectionTypeEnum.SERVER
      ? "bg-green-100 dark:bg-green-800 text-green-800 dark:text-green-100"
      : "bg-grey-100 dark:bg-grey-800 text-grey-800 dark:text-grey-100";

  return (
    <MenuItem>
      <span
        className={`${colors} inline-block whitespace-nowrap rounded-md px-1 py-[0.1rem] align-middle text-xs font-bold`}
      >
        {info.connectionType}
      </span>
      {info.id}
    </MenuItem>
  );
}

function sortByConnectionType(list: Array<WebsocketConnectionInfo>) {
  // Define the order of connection types
  const order = {
    [WebsocketConnectionTypeEnum.SERVER]: 1,
    [WebsocketConnectionTypeEnum.CLI]: 2,
    [WebsocketConnectionTypeEnum.PYTHON_LOGGER]: 3,
    [WebsocketConnectionTypeEnum.PYTHON_SCRIPT]: 4,
    [WebsocketConnectionTypeEnum.FRONTEND]: 5,
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
