import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { openWebSocket, sendLocation } from "requests/websocket";

export function useOpenCloseWebsocket() {
  const location = useLocation();

  useEffect(() => {
    openWebSocket(location.pathname);
  }, []);

  useEffect(() => {
    sendLocation(location.pathname);
  }, [location.pathname]);
}

// function useWebsocketRoom(messageType) {
//   const [id, setId] = useState(null);
//   const received = useWebsocketRooms((x) => x[id] ?? "");
//   const send = useCallback(
//     (message) => {
//       if (id) {
//         sendMessage({ message, id, messageType });
//       }
//     },
//     [id],
//   );

//   useEffect(() => {
//     const _id = createNewId();
//     useWebsocketRooms.getState().createRoom(_id);
//     setId(_id);

//     // cleanup
//     return () => {
//       useWebsocketRooms.getState().deleteRoom(_id);
//     };
//   }, []);

//   return [received, send];
// }
