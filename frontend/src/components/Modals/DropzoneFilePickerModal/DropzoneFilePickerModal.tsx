import * as Dialog from "@radix-ui/react-dialog";
import { ModalTypeEnum } from "components/Modals/types";
import {
  FileBrowserPane,
  type FileNode,
} from "components/Panes/Overview/FileBrowser/FileBrowserPane";
import { useState } from "react";
import { closeModal, useModalData } from "state/actions/modal";

export function DropzoneFilePickerModal({ open }: { open: boolean }) {
  const { title, remainingSlots, onPickPaths } = useModalData(
    ModalTypeEnum.DROPZONE_FILE_PICKER,
  );
  const [selectedNode, setSelectedNode] = useState<FileNode | null>(null);

  if (!open) {
    return null;
  }

  const canAttach = selectedNode?.type === "file";

  function attachFile(node: FileNode | null) {
    if (!node || node.type !== "file") {
      return;
    }
    onPickPaths([node.fullPath]);
    closeModal();
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <Dialog.Title className="text-xs font-bold uppercase tracking-[0.2em] text-setta-400">
        {title}
      </Dialog.Title>
      {remainingSlots !== null && (
        <p className="text-[11px] uppercase tracking-widest text-setta-300">
          Slots remaining: {remainingSlots}
        </p>
      )}
      <div className="min-h-0 flex-1">
        <FileBrowserPane
          onSelectionChange={setSelectedNode}
          onFileOpen={(node) => attachFile(node)}
        />
      </div>
      <div className="mb-2 mt-2 flex justify-end gap-2">
        <Dialog.Close asChild>
          <button
            className="nodrag inline-flex cursor-pointer items-center rounded-full bg-setta-200 px-3 py-1 text-sm font-bold text-setta-600 hover:cursor-pointer hover:bg-setta-300 focus-visible:ring-2 dark:bg-setta-850 dark:text-setta-200 dark:hover:bg-setta-900"
            onClick={() => attachFile(selectedNode)}
            disabled={!canAttach}
          >
            Attach
          </button>
        </Dialog.Close>
        <Dialog.Close asChild>
          <button
            className="nodrag inline-flex cursor-pointer items-center rounded-full border border-solid border-setta-200 px-3 py-1 text-sm font-bold text-setta-400 hover:cursor-pointer hover:border-setta-500 hover:text-setta-600 focus-visible:ring-2 dark:border-setta-800 dark:hover:bg-setta-900 dark:hover:text-setta-200"
            onClick={closeModal}
          >
            Close
          </button>
        </Dialog.Close>
      </div>
    </div>
  );
}
