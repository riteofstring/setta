import * as Dialog from "@radix-ui/react-dialog";
import { useModal } from "models/modal";
import { useRef } from "react";
import { extractArgparseArgs } from "thunks/createSectionOrDeck";
import { Footer } from "utils/Modals/SaveLoadModal/SaveLoadModal";

export function CreateFromArgparseModal() {
  const textValue = useRef("");

  function onClick() {
    extractArgparseArgs({
      pathToScript: textValue.current,
      ...useModal.getState().modalData,
    });
  }

  return (
    <>
      <Dialog.Title className="mx-3 mb-4 font-bold uppercase tracking-widest text-runcoder-400">
        {"Create From Argparse"}
      </Dialog.Title>
      <article className="relative flex flex-grow overflow-hidden rounded-lg border border-runcoder-100 bg-runcoder-50 p-4  dark:border-runcoder-700/50 dark:bg-runcoder-900 dark:text-runcoder-300">
        <input
          className="overflow-y flex-grow resize-none bg-transparent font-mono text-xs outline-none"
          placeholder="path to python file"
          onChange={(e) => (textValue.current = e.target.value)}
        />
      </article>

      <Footer buttonText={"Create"} onClick={onClick} />
    </>
  );
}
