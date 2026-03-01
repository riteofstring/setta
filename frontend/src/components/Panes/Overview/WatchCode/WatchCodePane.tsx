import { WatchCodeToggleButton } from "components/AppHeader/WatchCodeToggleButton";
import { useCallback, useEffect, useRef } from "react";
import { FiTrash2 } from "react-icons/fi";
import { MdAdd } from "react-icons/md";
import { RiRepeatLine } from "react-icons/ri";
import { NULL_PROJECT_CONFIG_ID, useProjectState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import { useLocalValue } from "state/hooks/utils";
import { route_set_watch_code_inputs } from "utils/generatedEndpoints";
import type { WatchCodeFolder } from "utils/generatedTypes";

type WatchInputs = {
  watchCodeFolders: WatchCodeFolder[];
  watchCodeFiles: string[];
};

export function WatchCodePane() {
  const { canEditLayout } = useShareCapabilities();
  const { watchCodeFolders, watchCodeFiles, projectConfigId } = useProjectState(
    (
      state,
    ): {
      watchCodeFolders: WatchCodeFolder[];
      watchCodeFiles: string[];
      projectConfigId: string;
    } => ({
      watchCodeFolders: state.projectConfig.watchCodeFolders,
      watchCodeFiles: state.projectConfig.watchCodeFiles,
      projectConfigId: state.projectConfig.id,
    }),
  );

  const [localFolders, setLocalFolders] = useLocalValue(watchCodeFolders);
  const [localFiles, setLocalFiles] = useLocalValue(watchCodeFiles);
  const foldersRef = useRef(localFolders);
  const filesRef = useRef(localFiles);

  useEffect(() => {
    foldersRef.current = localFolders;
  }, [localFolders]);

  useEffect(() => {
    filesRef.current = localFiles;
  }, [localFiles]);

  const inputsDisabled =
    !canEditLayout || projectConfigId === NULL_PROJECT_CONFIG_ID;

  const persistInputs = useCallback(
    ({ watchCodeFolders, watchCodeFiles }: WatchInputs) => {
      if (inputsDisabled) {
        return;
      }
      void route_set_watch_code_inputs({
        projectConfigId,
        watchCodeFolders,
        watchCodeFiles,
      });
    },
    [inputsDisabled, projectConfigId],
  );

  const updateFolder = useCallback(
    (index: number, update: Partial<WatchCodeFolder>, commit = false) => {
      setLocalFolders((prev) => {
        const next = prev.map((folder, idx) =>
          idx === index ? { ...folder, ...update } : folder,
        );
        if (commit) {
          persistInputs({
            watchCodeFolders: next,
            watchCodeFiles: filesRef.current,
          });
        }
        return next;
      });
    },
    [persistInputs, setLocalFolders],
  );

  const updateFile = useCallback(
    (index: number, value: string, commit = false) => {
      setLocalFiles((prev) => {
        const next = prev.map((file, idx) => (idx === index ? value : file));
        if (commit) {
          persistInputs({
            watchCodeFolders: foldersRef.current,
            watchCodeFiles: next,
          });
        }
        return next;
      });
    },
    [persistInputs, setLocalFiles],
  );

  const addFolder = useCallback(() => {
    setLocalFolders((prev) => [
      ...prev,
      { path: "", recursive: true } as WatchCodeFolder,
    ]);
  }, [setLocalFolders]);

  const addFile = useCallback(() => {
    setLocalFiles((prev) => [...prev, ""]);
  }, [setLocalFiles]);

  const removeFolder = useCallback(
    (index: number) => {
      setLocalFolders((prev) => {
        const next = prev.filter((_, idx) => idx !== index);
        persistInputs({
          watchCodeFolders: next,
          watchCodeFiles: filesRef.current,
        });
        return next;
      });
    },
    [persistInputs, setLocalFolders],
  );

  const removeFile = useCallback(
    (index: number) => {
      setLocalFiles((prev) => {
        const next = prev.filter((_, idx) => idx !== index);
        persistInputs({
          watchCodeFolders: foldersRef.current,
          watchCodeFiles: next,
        });
        return next;
      });
    },
    [persistInputs, setLocalFiles],
  );

  const inputClasses =
    "nodrag nopan nowheel w-full box-border truncate rounded-full bg-white py-1.5 pl-4 text-sm text-setta-700 ring-2 ring-setta-200 focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-setta-900 dark:text-setta-400 dark:ring-setta-700";
  const addInputButtonClasses =
    "nodrag nopan nowheel relative inline-flex h-6 shrink-0 cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-1 text-xs font-semibold text-setta-600 transition-colors hover:text-setta-900 focus-visible:ring-2 active:!bg-blue-100 disabled:cursor-not-allowed disabled:text-setta-400 disabled:opacity-60 dark:text-setta-300 dark:hover:bg-transparent dark:hover:text-white active:dark:!bg-transparent dark:disabled:text-setta-500";

  return (
    <div className="setta-pane-scroll flex h-full min-h-0 min-w-0 flex-col gap-4 overflow-y-auto">
      <header className="flex flex-col gap-2">
        <WatchCodeToggleButton />
        <p className="text-[11px] leading-snug text-setta-500 dark:text-setta-400">
          New top-level Python defs and classes become callable sections when
          watch mode is on.
        </p>
      </header>
      <hr className="border-setta-200/70 dark:border-setta-800" />

      <div
        className="flex flex-col gap-2"
        data-setting-anchor="core.watch_code.folders"
      >
        <div className="flex w-full flex-wrap items-center gap-2 @container">
          <h3 className="min-w-[7rem] flex-1 text-xs font-bold uppercase tracking-tight text-setta-400 dark:text-setta-500">
            Watch Folders
          </h3>
          <button
            className={`${addInputButtonClasses} w-full justify-center @[14rem]:ml-auto @[14rem]:w-auto`}
            disabled={inputsDisabled}
            onClick={addFolder}
            type="button"
          >
            <MdAdd size={15} aria-hidden />
            Add Folder
          </button>
        </div>
        {localFolders.length === 0 ? (
          <p className="rounded border border-setta-100 bg-white/40 p-2 text-[11px] text-setta-500 dark:border-setta-800 dark:bg-setta-900/40 dark:text-setta-400">
            No folders yet.
          </p>
        ) : (
          <div className="space-y-2">
            {localFolders.map((folder, index) => (
              <div className="w-full" key={index}>
                <div className="relative min-w-[10rem]">
                  <input
                    className={`${inputClasses} pr-16`}
                    disabled={inputsDisabled}
                    onBlur={(event) =>
                      updateFolder(index, { path: event.target.value }, true)
                    }
                    onChange={(event) =>
                      updateFolder(index, { path: event.target.value })
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.currentTarget.blur();
                      }
                    }}
                    placeholder="relative/path/to/folder"
                    value={folder.path}
                  />
                  <div className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
                    <button
                      aria-label="Toggle recursive watch"
                      aria-pressed={folder.recursive}
                      className={`nodrag nopan nowheel inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md transition-colors focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                        folder.recursive
                          ? "text-blue-600 hover:text-blue-500 dark:text-blue-300 dark:hover:text-blue-200"
                          : "text-setta-500 hover:text-setta-900 dark:text-setta-400 dark:hover:text-setta-100"
                      }`}
                      disabled={inputsDisabled}
                      onClick={() =>
                        updateFolder(
                          index,
                          { recursive: !folder.recursive },
                          true,
                        )
                      }
                      type="button"
                    >
                      <RiRepeatLine size={12} />
                    </button>
                    <button
                      aria-label="Remove folder watch path"
                      className="nodrag nopan nowheel inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-setta-400 transition-colors hover:bg-red-500/10 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-setta-500 dark:hover:text-red-400"
                      disabled={inputsDisabled}
                      onClick={() => removeFolder(index)}
                      type="button"
                    >
                      <FiTrash2 size={12} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div
        className="flex flex-col gap-2"
        data-setting-anchor="core.watch_code.files"
      >
        <div className="flex w-full flex-wrap items-center gap-2 @container">
          <h3 className="min-w-[6rem] flex-1 text-xs font-bold uppercase tracking-tight text-setta-400 dark:text-setta-500">
            Watch Files
          </h3>
          <button
            className={`${addInputButtonClasses} w-full justify-center @[14rem]:ml-auto @[14rem]:w-auto`}
            disabled={inputsDisabled}
            onClick={addFile}
            type="button"
          >
            <MdAdd size={15} aria-hidden />
            Add File
          </button>
        </div>
        {localFiles.length === 0 ? (
          <p className="rounded border border-setta-100 bg-white/40 p-2 text-[11px] text-setta-500 dark:border-setta-800 dark:bg-setta-900/40 dark:text-setta-400">
            No files yet.
          </p>
        ) : (
          <div className="space-y-2">
            {localFiles.map((file, index) => (
              <div className="w-full" key={index}>
                <div className="relative min-w-[10rem]">
                  <input
                    className={`${inputClasses} pr-11`}
                    disabled={inputsDisabled}
                    onBlur={(event) =>
                      updateFile(index, event.target.value, true)
                    }
                    onChange={(event) => updateFile(index, event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.currentTarget.blur();
                      }
                    }}
                    placeholder="relative/path/to/file.py"
                    value={file}
                  />
                  <button
                    aria-label="Remove file watch path"
                    className="nodrag nopan nowheel absolute right-2.5 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-setta-400 transition-colors hover:bg-red-500/10 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-setta-500 dark:hover:text-red-400"
                    disabled={inputsDisabled}
                    onClick={() => removeFile(index)}
                    type="button"
                  >
                    <FiTrash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
