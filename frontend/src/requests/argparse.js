import { createSectionsFromArgparse } from "state/actions/createSection";
import { sendMessageInRoom } from "state/actions/websocketRooms";

export async function extractArgparseArgs({ pathToScript, ...props }) {
  const args = await sendMessageInRoom({
    messageType: "extractArgparseArgs",
    content: pathToScript,
  });
  createSectionsFromArgparse({ pathToScript, args, ...props });
}
