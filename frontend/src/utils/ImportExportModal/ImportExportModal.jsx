import * as Dialog from "@radix-ui/react-dialog";
import { HiOutlineDuplicate } from "react-icons/hi";
import { Footer } from "utils/SaveLoadModal/SaveLoadModal";

export function ImportExportModalContent({
  projectJson,
  title,
  disabled = true,
  copyBtn = false,
  buttonText = null,
}) {
  const value = JSON.stringify(projectJson, null, 2);

  return (
    <>
      <div className="flex min-h-[70vh] flex-grow flex-col  ">
        <Dialog.Title className="mx-3 mb-4 font-bold uppercase tracking-widest text-slate-400">
          {title}
        </Dialog.Title>
        <article className="relative flex flex-grow overflow-hidden rounded-lg border border-runcoder-100 bg-runcoder-50 p-4  dark:border-runcoder-700/50 dark:bg-runcoder-900 dark:text-runcoder-300">
          {copyBtn && (
            <HiOutlineDuplicate className="absolute right-8 top-4 h-5 w-5 cursor-pointer text-runcoder-300 hover:text-runcoder-600 dark:hover:text-white" />
          )}
          <textarea
            disabled={disabled}
            className="overflow-y flex-grow resize-none bg-transparent font-mono text-xs outline-none"
            value={value}
            // onChange={(v) => setDescription(v.target.value)}
            placeholder="JSON, state 'em..."
          />
        </article>

        <Footer buttonText={buttonText} />
      </div>
    </>
  );
}
