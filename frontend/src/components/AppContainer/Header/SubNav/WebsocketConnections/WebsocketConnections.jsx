import { useWebsocketConnectionList } from "models/websocket";
import { TbPlugConnected } from "react-icons/tb";
import { Badge } from "utils/atoms/badges/badge";
import { IconButton } from "utils/atoms/buttons/IconButton";
import { StandardDropdown } from "utils/atoms/dropdown/dropdown";
import { Item } from "utils/atoms/dropdown/item";

export function WebsocketConnections() {
  return (
    <StandardDropdown
      trigger={<IconButton color="text-slate-400" icon={<TbPlugConnected />} />}
      content={<ConnectionList />}
    />
  );
}

function ConnectionList() {
  const connections = useWebsocketConnectionList((x) =>
    x.connections.filter((c) => c.isCLI)
  );

  return connections.length > 0 ? (
    connections.map((x) => <ConnectionItem info={x} key={x.websocketId} />)
  ) : (
    <Item>No CLI connections</Item>
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
    <Item onClick={() => setConnectedTo(info.websocketId)}>
      <Badge twClasses={twClasses}>{"CLI"}</Badge>
      {info.websocketId}
    </Item>
  );
}
