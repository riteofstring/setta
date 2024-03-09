import { useWebsocketConnectionList } from "models/websocket";
import { Badge } from "utils/atoms/badges/badge";
import { MenuDropdown } from "utils/atoms/menubar/menudropdown";
import { MenuItem } from "utils/atoms/menubar/menudropdownitem";

export function WebsocketConnections() {
  return (
    <MenuDropdown trigger="CLI">
      <ConnectionList />
    </MenuDropdown>
  );
}

function ConnectionList() {
  const connections = useWebsocketConnectionList((x) =>
    x.connections.filter((c) => c.isCLI)
  );

  return connections.length > 0 ? (
    connections.map((x) => <ConnectionItem info={x} key={x.websocketId} />)
  ) : (
    <MenuItem>No CLI connections</MenuItem>
  );
}

function ConnectionItem({ info }) {
  const connectedTo = useWebsocketConnectionList((x) => x.connectedTo);
  const setConnectedTo = useWebsocketConnectionList((x) => x.setConnectedTo);

  const twClasses =
    connectedTo === info.websocketId
      ? "bg-green-100 dark:bg-green-800 text-green-800 dark:text-green-100"
      : "bg-grey-100 dark:bg-grey-800 text-grey-800 dark:text-grey-100";

  return (
    <MenuItem onClick={() => setConnectedTo(info.websocketId)}>
      <Badge twClasses={twClasses}>{"CLI"}</Badge>
      {info.websocketId}
    </MenuItem>
  );
}
