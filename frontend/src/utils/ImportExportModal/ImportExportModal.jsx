import * as Dialog from "@radix-ui/react-dialog";
import { Footer } from "utils/SaveLoadModal/SaveLoadModal";

export function ImportExportModalContent({ projectJson }) {
  const value = JSON.stringify(projectJson, null, 2);

  return (
    <>
      <div className="flex min-h-[70vh] flex-grow flex-col  ">
        <Dialog.Title className="mx-3 mb-4 font-bold uppercase tracking-widest text-slate-400">
          Export JSON
        </Dialog.Title>
        <article className="flex flex-grow  overflow-hidden rounded-lg border border-runcoder-100 bg-runcoder-50 p-4 dark:border-runcoder-700/50 dark:bg-runcoder-900 dark:text-runcoder-300">
          <textarea
            disabled={true}
            className="overflow-y flex-grow resize-none bg-transparent font-mono text-xs"
            value={value}
            // onChange={(v) => setDescription(v.target.value)}
            placeholder="JSON, state 'em..."
          />
        </article>

        <Footer />
      </div>
    </>
  );
}
