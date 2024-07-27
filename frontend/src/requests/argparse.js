import { createSectionsFromArgparse } from "state/actions/sections/createSections";
import { sendMessageInRoom } from "state/actions/websocket/websocketRooms";

export async function extractArgparseArgs({ pathToScript, ...props }) {
  const args = await sendMessageInRoom({
    messageType: "extractArgparseArgs",
    content: pathToScript,
  });
  createSectionsFromArgparse({ pathToScript, args, ...props });
}
