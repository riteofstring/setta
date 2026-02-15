import * as Dialog from "@radix-ui/react-dialog";
import { ProjectConfigThumbnailSurface } from "components/ProjectConfigs/ProjectConfigThumbnailSurface";
import { useEffect, useMemo, useState } from "react";
import { FiGrid, FiList } from "react-icons/fi";
import { closeModal } from "state/actions/modal";
import { type HomeProjectGalleryViewMode } from "state/definitions";
import { ObjectValues, ProjectConfig } from "utils/generatedTypes";
import { FileNameInput } from "./FileNameInput";

export const SaveLoadModalModeEnum = { load: "load", save: "save" } as const;
type SaveLoadModalMode = ObjectValues<typeof SaveLoadModalModeEnum>;
type SaveLoadConfigEntry = Pick<
  ProjectConfig,
  "id" | "name" | "previewImgColor" | "topLevelSections"
>;
const SAVE_LOAD_CONFIG_GRID_TEMPLATE_COLUMNS =
  "repeat(auto-fill, minmax(10.5rem, 14rem))";

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
  files: Array<SaveLoadConfigEntry>;
  onClickActionButton: (info: {
    selectedName: string | null;
    filename: string;
  }) => void;
  title: string;
  buttonText: string;
  placeholder: string;
}) {
  const [selectedConfigName, setSelectedConfigName] = useState<string | null>(
    null,
  );
  const [filename, setFilename] = useState("");
  const [configViewMode, setConfigViewMode] =
    useState<HomeProjectGalleryViewMode>("thumbnails");

  const sortedFiles = useMemo(
    () => [...files].sort((a, b) => a.name.localeCompare(b.name)),
    [files],
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    setSelectedConfigName(null);
    setFilename("");
    setConfigViewMode("thumbnails");
  }, [open]);

  const existingByTypedName = useMemo(() => {
    const normalizedFilename = filename.trim();
    if (!normalizedFilename) {
      return null;
    }
    return (
      sortedFiles.find((config) => config.name === normalizedFilename) ?? null
    );
  }, [filename, sortedFiles]);

  function onClose() {
    setSelectedConfigName(null);
    setFilename("");
    setConfigViewMode("thumbnails");
  }

  function onPickConfig(configName: string) {
    setSelectedConfigName(configName);
    if (modalMode === SaveLoadModalModeEnum.save) {
      setFilename(configName);
    }
  }

  function onOpenConfig(configName: string) {
    if (modalMode !== SaveLoadModalModeEnum.load) {
      return;
    }
    onClickActionButton({
      selectedName: configName,
      filename: configName,
    });
    closeModal();
    onClose();
  }

  function onLoadSelectedConfig() {
    if (!selectedConfigName) {
      return;
    }
    onClickActionButton({
      selectedName: selectedConfigName,
      filename: selectedConfigName,
    });
  }

  function onButtonClick() {
    if (modalMode === SaveLoadModalModeEnum.load) {
      onLoadSelectedConfig();
      onClose();
      return;
    }

    const normalizedFilename = filename.trim();
    onClickActionButton({
      selectedName: existingByTypedName?.name ?? null,
      filename: normalizedFilename,
    });
    onClose();
  }

  const canSubmit =
    modalMode === SaveLoadModalModeEnum.load
      ? selectedConfigName !== null
      : filename.trim().length > 0;

  const helperText =
    modalMode === SaveLoadModalModeEnum.load
      ? "Select a saved project config to load."
      : "Choose an existing config or enter a new project config name.";

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <header>
        <Dialog.Title className="text-sm font-semibold text-setta-800 dark:text-setta-100">
          {title}
        </Dialog.Title>
        <p className="mt-1 text-xs text-setta-500 dark:text-setta-400">
          {helperText}
        </p>
      </header>

      <section className="min-h-0 flex-1 overflow-hidden rounded-xl border border-setta-200/70 p-2 dark:border-setta-800/80">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-setta-400">
            Project Configs
          </h3>
          <div className="flex items-center gap-1">
            <button
              type="button"
              data-testid="save-load-view-thumbnails"
              className={`flex h-6 w-6 items-center justify-center rounded-md border transition-colors ${
                configViewMode === "thumbnails"
                  ? "border-blue-500/60 bg-blue-100 text-blue-700 dark:border-blue-500/70 dark:bg-blue-950/40 dark:text-blue-200"
                  : "border-setta-200 text-setta-500 hover:bg-setta-100 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
              }`}
              aria-label="Show thumbnail gallery"
              onClick={() => setConfigViewMode("thumbnails")}
            >
              <FiGrid size={12} />
            </button>
            <button
              type="button"
              data-testid="save-load-view-list"
              className={`flex h-6 w-6 items-center justify-center rounded-md border transition-colors ${
                configViewMode === "list"
                  ? "border-blue-500/60 bg-blue-100 text-blue-700 dark:border-blue-500/70 dark:bg-blue-950/40 dark:text-blue-200"
                  : "border-setta-200 text-setta-500 hover:bg-setta-100 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
              }`}
              aria-label="Show list view"
              onClick={() => setConfigViewMode("list")}
            >
              <FiList size={12} />
            </button>
            <span className="ml-1 text-[10px] uppercase tracking-[0.14em] text-setta-400">
              {sortedFiles.length}
            </span>
          </div>
        </div>

        {sortedFiles.length === 0 ? (
          <div className="grid h-full place-items-center rounded-lg border border-dashed border-setta-200/70 text-xs text-setta-500 dark:border-setta-800/70 dark:text-setta-400">
            No saved project configs found.
          </div>
        ) : configViewMode === "thumbnails" ? (
          <div
            className="grid max-h-full min-h-0 justify-start gap-4 overflow-y-auto pr-1"
            style={{
              gridTemplateColumns: SAVE_LOAD_CONFIG_GRID_TEMPLATE_COLUMNS,
            }}
          >
            {sortedFiles.map((config) => (
              <ConfigThumbnailCard
                key={config.id}
                config={config}
                isSelected={selectedConfigName === config.name}
                onSelect={onPickConfig}
                onOpen={onOpenConfig}
              />
            ))}
          </div>
        ) : (
          <div className="flex max-h-full min-h-0 flex-col gap-2 overflow-y-auto pr-1">
            {sortedFiles.map((config) => (
              <ConfigListRow
                key={config.id}
                config={config}
                isSelected={selectedConfigName === config.name}
                onSelect={onPickConfig}
                onOpen={onOpenConfig}
              />
            ))}
          </div>
        )}
      </section>

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

function ConfigThumbnailCard({
  config,
  isSelected,
  onSelect,
  onOpen,
}: {
  config: SaveLoadConfigEntry;
  isSelected: boolean;
  onSelect: (configName: string) => void;
  onOpen: (configName: string) => void;
}) {
  const cardClasses = isSelected
    ? "border-blue-500/70 bg-blue-50/60 dark:border-blue-500/70 dark:bg-blue-950/30"
    : "border-setta-200/85 bg-setta-50/65 hover:border-setta-300 hover:bg-setta-50/85 dark:border-setta-700 dark:bg-setta-900/35 dark:hover:border-setta-600 dark:hover:bg-setta-900/55";

  return (
    <button
      type="button"
      data-testid="save-load-config-card"
      data-config-name={config.name}
      className={`relative grid min-h-[13rem] w-full max-w-[14rem] cursor-default grid-rows-[1fr_min-content] overflow-hidden rounded-2xl border text-left transition-colors ${cardClasses}`}
      onClick={() => onSelect(config.name)}
      onDoubleClick={() => onOpen(config.name)}
    >
      <div
        data-testid="save-load-config-preview"
        className="col-start-1 col-end-2 row-start-1 row-end-2"
      >
        <ProjectConfigThumbnailSurface
          previewImgColor={
            config.previewImgColor || "bg-setta-100 dark:bg-setta-800"
          }
          topLevelSections={config.topLevelSections}
        />
      </div>
      <div className="col-start-1 col-end-2 row-start-2 row-end-3 flex min-h-[2.6rem] items-center bg-white px-3 py-2 dark:bg-setta-860">
        <p className="truncate text-xs font-medium text-setta-700 dark:text-setta-200">
          {config.name}
        </p>
      </div>
    </button>
  );
}

function ConfigListRow({
  config,
  isSelected,
  onSelect,
  onOpen,
}: {
  config: SaveLoadConfigEntry;
  isSelected: boolean;
  onSelect: (configName: string) => void;
  onOpen: (configName: string) => void;
}) {
  const baseClasses =
    "flex w-full cursor-default items-center gap-2 rounded border px-2 py-2 text-left text-xs transition-colors";
  const activeClasses =
    "border-blue-500/60 bg-blue-50/60 text-blue-700 dark:border-blue-500/70 dark:bg-blue-950/35 dark:text-blue-200";
  const inactiveClasses =
    "border-setta-200 text-setta-700 hover:bg-setta-50 dark:border-setta-700 dark:text-setta-200 dark:hover:bg-setta-850";

  return (
    <button
      type="button"
      data-testid="save-load-config-list-row"
      data-config-name={config.name}
      className={`${baseClasses} ${isSelected ? activeClasses : inactiveClasses}`}
      onClick={() => onSelect(config.name)}
      onDoubleClick={() => onOpen(config.name)}
    >
      <span className="truncate">{config.name}</span>
    </button>
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
