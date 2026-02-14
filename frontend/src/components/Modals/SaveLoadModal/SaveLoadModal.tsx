import * as Dialog from "@radix-ui/react-dialog";
import {
  FileBrowserPane,
  type FileNode,
} from "components/Panes/Overview/FileBrowser/FileBrowserPane";
import { useEffect, useMemo, useState } from "react";
import { closeModal } from "state/actions/modal";
import { useSaveLoadFileBrowserState } from "state/definitions";
import { ObjectValues } from "utils/generatedTypes";
import { FileNameInput } from "./FileNameInput";

export const SaveLoadModalModeEnum = { load: "load", save: "save" } as const;
type SaveLoadModalMode = ObjectValues<typeof SaveLoadModalModeEnum>;

export function SaveLoadModal({
  open,
  modalMode,
  files,
  onClickActionButton,
  title,
  buttonText,
  placeholder,
}: {
  open?: boolean;
  modalMode: SaveLoadModalMode;
  files: Array<{ id: string; name: string }>;
  onClickActionButton: (info: {
    selectedName: string | null;
    filename: string;
  }) => void;
  title: string;
  buttonText: string;
  placeholder: string;
}) {
  const [selectedNode, setSelectedNode] = useState<FileNode | null>(null);
  const [filename, setFilename] = useState("");
  const knownConfigNames = useMemo(
    () => files.map((x) => x.name).sort((a, b) => a.localeCompare(b)),
    [files],
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    useSaveLoadFileBrowserState.getState().reset?.();
    setSelectedNode(null);
    setFilename("");
  }, [open]);

  function resolveSelectedName(): string | null {
    if (selectedNode?.type === "file") {
      const selectedName = selectedNode.name.trim();
      if (selectedName) {
        return selectedName;
      }
    }
    const trimmedFilename = filename.trim();
    if (!trimmedFilename) {
      return null;
    }
    return trimmedFilename;
  }

  function onClose() {
    setSelectedNode(null);
    setFilename("");
  }

  function onButtonClick() {
    const selectedName = resolveSelectedName();
    onClickActionButton({
      selectedName,
      filename: filename.trim(),
    });
    onClose();
  }

  function onFileOpen(node: FileNode) {
    if (node.type !== "file") {
      return;
    }
    const selectedName = node.name.trim();
    setSelectedNode(node);
    setFilename(selectedName);
    onClickActionButton({
      selectedName,
      filename: selectedName,
    });
    closeModal();
    onClose();
  }

  const canSubmit =
    modalMode === SaveLoadModalModeEnum.load
      ? resolveSelectedName() !== null
      : filename.trim().length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <header>
        <Dialog.Title className="text-sm font-semibold text-setta-800 dark:text-setta-100">
          {title}
        </Dialog.Title>
        <p className="mt-1 text-xs text-setta-500 dark:text-setta-400">
          Browse files, then {modalMode === SaveLoadModalModeEnum.load ? "load" : "save"} a project config.
        </p>
      </header>

      {knownConfigNames.length > 0 && (
        <section className="rounded-lg border border-setta-200/70 bg-setta-50/70 p-2 dark:border-setta-800/80 dark:bg-setta-900/40">
          <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-setta-400">
            Existing Config Names
          </h3>
          <div className="flex max-h-20 flex-wrap gap-1 overflow-y-auto">
            {knownConfigNames.map((name) => (
              <button
                key={name}
                type="button"
                className="rounded-full border border-setta-200 px-2 py-[2px] text-[11px] text-setta-600 hover:bg-white dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
                onClick={() => setFilename(name)}
              >
                {name}
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="min-h-0 flex-1 rounded-xl border border-setta-200/70 p-2 dark:border-setta-800/80">
        <FileBrowserPane
          useFileBrowserStateHook={useSaveLoadFileBrowserState}
          onSelectionChange={(node) => {
            setSelectedNode(node);
            if (node?.type === "file") {
              setFilename(node.name.trim());
            }
          }}
          onFileOpen={onFileOpen}
          includeSettaInitializedFolders
        />
      </div>

      {modalMode === SaveLoadModalModeEnum.save && (
        <FileNameInput
          placeholder={placeholder}
          value={filename}
          onChange={setFilename}
        />
      )}

      <Footer
        buttonText={buttonText}
        onClose={onClose}
        onClick={onButtonClick}
        canSubmit={canSubmit}
      />
    </div>
  );
}

function Footer({
  onClose,
  onClick,
  buttonText,
  canSubmit,
}: {
  onClose: () => void;
  onClick: () => void;
  buttonText: string;
  canSubmit: boolean;
}) {
  return (
    <div className="mb-1 mt-1 flex justify-end gap-2">
      {buttonText && (
        <Dialog.Close asChild>
          <button
            className="nodrag inline-flex h-8 cursor-pointer items-center rounded-md bg-blue-500 px-3 text-sm font-semibold text-white transition-colors hover:bg-blue-600 focus-visible:ring-2 disabled:cursor-default disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
            onClick={onClick}
            disabled={!canSubmit}
          >
            {buttonText}
          </button>
        </Dialog.Close>
      )}

      <Dialog.Close asChild>
        <button
          className="nodrag inline-flex h-8 cursor-pointer items-center rounded-md border border-setta-200 px-3 text-sm font-semibold text-setta-500 transition-colors hover:bg-setta-100 hover:text-setta-700 focus-visible:ring-2 dark:border-setta-700 dark:text-setta-200 dark:hover:bg-setta-800"
          onClick={() => {
            closeModal();
            onClose();
          }}
        >
          Close
        </button>
      </Dialog.Close>
    </div>
  );
}
