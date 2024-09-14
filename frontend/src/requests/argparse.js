import { createSectionsFromArgparse } from "state/actions/sections/createSections";
import { sendMessageAndWait } from "state/actions/temporaryMiscState";

export async function extractArgparseArgs({ pathToScript, ...props }) {
  const args = await sendMessageAndWait({
    messageType: "extractArgparseArgs",
    content: pathToScript,
  });
  createSectionsFromArgparse({ pathToScript, args, ...props });
}
