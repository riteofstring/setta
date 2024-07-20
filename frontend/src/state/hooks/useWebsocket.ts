import { openWebSocket, sendLocation, sendMessage } from "dbRequests/websocket";
import { useWebsocketRooms } from "state/definitions/websocket";
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { createNewId } from "z_utils/utils";

export function useOpenCloseWebsocket() {
  const location = useLocation();

  useEffect(() => {
    openWebSocket(location.pathname);
  }, []);

  useEffect(() => {
    sendLocation(location.pathname);
  }, [location.pathname]);
}

export async function sendMessageInRoom({ id, messageType, content }) {
  return new Promise((resolve) => {
    const actualId = id ? id : createNewId();
    const unsub = useWebsocketRooms.subscribe(
      (x) => x[actualId],
      (x) => {
        unsub();
        resolve(x);
        useWebsocketRooms.getState().deleteRoom(actualId);
      },
    );

    sendMessage({
      id: actualId,
      messageType,
      content,
    });
  });
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
