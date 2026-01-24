import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import {
  useAllProjectMetadata,
  useProjectState,
  useShareSession,
} from "state/definitions";
import { route_set_watch_code_config } from "utils/generatedEndpoints";
import type { WatchCodeFolder } from "utils/generatedTypes";

const INPUT_CLASSES =
  "w-full rounded-md border border-setta-200 bg-transparent px-2 py-1 text-xs text-setta-800 focus-visible:border-blue-300 focus-visible:outline-none dark:border-setta-800 dark:text-setta-100";

const ACTION_BUTTON_CLASSES =
  "rounded-md border border-setta-200 bg-white px-2 py-1 text-[11px] font-semibold text-setta-700 hover:text-setta-900 dark:border-setta-800 dark:bg-setta-900 dark:text-setta-200 dark:hover:text-setta-100";

const SECTION_HEADER_CLASSES =
  "text-[11px] font-semibold uppercase tracking-wide text-setta-400";

export function WatchCodeSettings() {
  const projectConfig = useProjectState((x) => x.projectConfig);
  const isShareMode = useShareSession((x) => x.isShareMode);
  const [folders, setFolders] = useState<WatchCodeFolder[]>(
    projectConfig.watchCodeFolders ?? [],
  );
  const [files, setFiles] = useState<string[]>(
    projectConfig.watchCodeFiles ?? [],
  );

  useEffect(() => {
    setFolders(projectConfig.watchCodeFolders ?? []);
    setFiles(projectConfig.watchCodeFiles ?? []);
  }, [
    projectConfig.id,
    projectConfig.watchCodeFolders,
    projectConfig.watchCodeFiles,
  ]);

  const dirty = useMemo(() => {
    const currentFolders = projectConfig.watchCodeFolders ?? [];
    const currentFiles = projectConfig.watchCodeFiles ?? [];
    if (folders.length !== currentFolders.length) {
      return true;
    }
    if (files.length !== currentFiles.length) {
      return true;
    }
    for (let idx = 0; idx < folders.length; idx += 1) {
      const next = folders[idx];
      const curr = currentFolders[idx];
      if (
        !curr ||
        next.path !== curr.path ||
        next.recursive !== curr.recursive
      ) {
        return true;
      }
    }
    for (let idx = 0; idx < files.length; idx += 1) {
      if (files[idx] !== currentFiles[idx]) {
        return true;
      }
    }
    return false;
  }, [
    folders,
    files,
    projectConfig.watchCodeFiles,
    projectConfig.watchCodeFolders,
  ]);

  const canEdit = !isShareMode;

  const persistChanges = async () => {
    if (!canEdit) {
      return;
    }
    const payload = {
      projectConfigId: projectConfig.id,
      watchCodeEnabled: projectConfig.watchCodeEnabled ?? false,
      watchCodeFolders: folders,
      watchCodeFiles: files,
    };
    await route_set_watch_code_config(payload);
    useProjectState.setState((state) => {
      state.projectConfig.watchCodeFolders = folders;
      state.projectConfig.watchCodeFiles = files;
    });
    useAllProjectMetadata.setState((state) => ({
      ...state,
      projectMetadata: state.projectMetadata.map((entry) =>
        entry.id === projectConfig.id
          ? { ...entry, watchCodeFolders: folders, watchCodeFiles: files }
          : entry,
      ),
    }));
  };

  return (
    <section className="mb-3 rounded-md border border-setta-200/70 p-2 dark:border-setta-850">
      <header className="mb-2 flex items-center justify-between">
        <span className={SECTION_HEADER_CLASSES}>Watch Code Inputs</span>
        <button
          type="button"
          className={ACTION_BUTTON_CLASSES}
          onClick={persistChanges}
          disabled={!canEdit || !dirty}
        >
          Save
        </button>
      </header>
      <div className="space-y-3">
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-setta-500">
              Folder Watches
            </span>
            <button
              type="button"
              className={ACTION_BUTTON_CLASSES}
              onClick={() => {
                setFolders((prev) => [...prev, { path: "", recursive: true }]);
              }}
              disabled={!canEdit}
            >
              Add Folder
            </button>
          </div>
          <div className="space-y-2">
            {folders.map((folder, idx) => (
              <div
                key={`watch-folder-${idx}`}
                className="flex items-center gap-2"
              >
                <input
                  className={INPUT_CLASSES}
                  value={folder.path}
                  placeholder="Path to folder"
                  onChange={(event: ChangeEvent<HTMLInputElement>) => {
                    const value = event.target.value;
                    setFolders((prev) =>
                      prev.map((entry, entryIdx) =>
                        entryIdx === idx ? { ...entry, path: value } : entry,
                      ),
                    );
                  }}
                  disabled={!canEdit}
                />
                <label className="flex items-center gap-1 text-[11px] text-setta-500">
                  <input
                    type="checkbox"
                    checked={folder.recursive}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      const checked = event.target.checked;
                      setFolders((prev) =>
                        prev.map((entry, entryIdx) =>
                          entryIdx === idx
                            ? { ...entry, recursive: checked }
                            : entry,
                        ),
                      );
                    }}
                    disabled={!canEdit}
                  />
                  Recursive
                </label>
                <button
                  type="button"
                  className={ACTION_BUTTON_CLASSES}
                  onClick={() => {
                    setFolders((prev) =>
                      prev.filter((_, entryIdx) => entryIdx !== idx),
                    );
                  }}
                  disabled={!canEdit}
                >
                  Remove
                </button>
              </div>
            ))}
            {folders.length === 0 && (
              <p className="text-[11px] text-setta-400">
                No folders watched yet.
              </p>
            )}
          </div>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-setta-500">
              File Watches
            </span>
            <button
              type="button"
              className={ACTION_BUTTON_CLASSES}
              onClick={() => {
                setFiles((prev) => [...prev, ""]);
              }}
              disabled={!canEdit}
            >
              Add File
            </button>
          </div>
          <div className="space-y-2">
            {files.map((file, idx) => (
              <div
                key={`watch-file-${idx}`}
                className="flex items-center gap-2"
              >
                <input
                  className={INPUT_CLASSES}
                  value={file}
                  placeholder="Path to file"
                  onChange={(event: ChangeEvent<HTMLInputElement>) => {
                    const value = event.target.value;
                    setFiles((prev) =>
                      prev.map((entry, entryIdx) =>
                        entryIdx === idx ? value : entry,
                      ),
                    );
                  }}
                  disabled={!canEdit}
                />
                <button
                  type="button"
                  className={ACTION_BUTTON_CLASSES}
                  onClick={() => {
                    setFiles((prev) =>
                      prev.filter((_, entryIdx) => entryIdx !== idx),
                    );
                  }}
                  disabled={!canEdit}
                >
                  Remove
                </button>
              </div>
            ))}
            {files.length === 0 && (
              <p className="text-[11px] text-setta-400">
                No files watched yet.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
