import { WatchCodeToggleButton } from "components/AppHeader/WatchCodeToggleButton";
import { useCallback, useEffect, useRef } from "react";
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
  const {
    watchCodeFolders,
    watchCodeFiles,
    projectConfigId,
  } = useProjectState(
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
    "w-full truncate rounded-full bg-white px-4 py-1 text-sm text-setta-700 ring-2 ring-setta-200 focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-setta-900 dark:text-setta-400 dark:ring-setta-700";

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto pr-2">
      <header className="flex flex-col gap-2">
        <WatchCodeToggleButton />
        <p className="text-[11px] leading-snug text-setta-500 dark:text-setta-400">
          New top-level Python defs and classes become callable sections when
          watch mode is on.
        </p>
      </header>
      <hr className="border-setta-200/70 dark:border-setta-800" />

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="min-w-[7rem] flex-1 text-xs font-bold uppercase tracking-tight text-setta-400 dark:text-setta-500">
            Watch Folders
          </h3>
          <button
            className="ml-auto inline-flex h-6 shrink-0 items-center gap-1 rounded px-2 text-[11px] font-semibold text-setta-600 hover:bg-setta-200/40 hover:text-setta-900 disabled:cursor-not-allowed disabled:opacity-50 dark:text-setta-300 dark:hover:bg-setta-800/40 dark:hover:text-setta-100"
            disabled={inputsDisabled}
            onClick={addFolder}
            type="button"
          >
            <i className="gg-add" />
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
              <div className="flex flex-wrap items-center gap-2" key={index}>
                <input
                  className={`${inputClasses} ml-[2px] min-w-[10rem] flex-1`}
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
                <button
                  aria-pressed={folder.recursive}
                  className={`nodrag inline-flex h-6 cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-1 text-[11px] font-semibold transition-colors focus-visible:ring-2 active:!bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-transparent active:dark:!bg-transparent ${folder.recursive ? "text-blue-600 hover:text-blue-500 dark:text-blue-300 dark:hover:text-blue-200" : "text-setta-500 hover:text-setta-900 dark:text-setta-400 dark:hover:text-setta-100"}`}
                  disabled={inputsDisabled}
                  onClick={() =>
                    updateFolder(index, { recursive: !folder.recursive }, true)
                  }
                  type="button"
                >
                  <RiRepeatLine size={12} />
                  Recursive
                </button>
                <button
                  className="inline-flex h-6 w-6 flex-none items-center justify-center rounded text-setta-400 hover:bg-red-500/10 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-setta-500 dark:hover:text-red-400"
                  disabled={inputsDisabled}
                  onClick={() => removeFolder(index)}
                  type="button"
                >
                  <i className="gg-trash" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="min-w-[6rem] flex-1 text-xs font-bold uppercase tracking-tight text-setta-400 dark:text-setta-500">
            Watch Files
          </h3>
          <button
            className="ml-auto inline-flex h-6 shrink-0 items-center gap-1 rounded px-2 text-[11px] font-semibold text-setta-600 hover:bg-setta-200/40 hover:text-setta-900 disabled:cursor-not-allowed disabled:opacity-50 dark:text-setta-300 dark:hover:bg-setta-800/40 dark:hover:text-setta-100"
            disabled={inputsDisabled}
            onClick={addFile}
            type="button"
          >
            <i className="gg-add" />
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
              <div className="flex flex-wrap items-center gap-2" key={index}>
                <input
                  className={`${inputClasses} min-w-[10rem] flex-1`}
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
                  className="inline-flex h-6 w-6 items-center justify-center rounded text-setta-400 hover:bg-red-500/10 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-setta-500 dark:hover:text-red-400"
                  disabled={inputsDisabled}
                  onClick={() => removeFile(index)}
                  type="button"
                >
                  <i className="gg-trash" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
