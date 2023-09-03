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
  const connections = useWebsocketConnectionList((x) => x.connections);

  return connections.map((x) => (
    <Item className="flex flex-row" key={x.websocketId}>
      <Badge twClasses="bg-green-100 dark:bg-green-800 text-green-800 dark:text-green-100">
        {x.isCLI ? "CLI" : "Web"}
      </Badge>
      {x.websocketId}
    </Item>
  ));
}
