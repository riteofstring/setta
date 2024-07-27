import * as Dialog from "@radix-ui/react-dialog";
import { useRef } from "react";
import { extractArgparseArgs } from "requests/argparse";
import { useModal } from "state/definitions";
import { Footer } from "components/Modals/SaveLoadModal/SaveLoadModal";

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
      <Dialog.Title className="mx-3 mb-4 font-bold uppercase tracking-widest text-setta-400">
        {"Create From Argparse"}
      </Dialog.Title>
      <article className="relative flex flex-grow overflow-hidden rounded-lg border border-setta-100 bg-setta-50 p-4  dark:border-setta-700/50 dark:bg-setta-900 dark:text-setta-300">
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
