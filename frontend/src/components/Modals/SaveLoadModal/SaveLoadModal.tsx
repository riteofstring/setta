import * as Dialog from "@radix-ui/react-dialog";
import { getNodesBounds } from "forks/xyflow/core/utils/graph";
import { getXYWidthHeight, MinimapSvg } from "forks/xyflow/minimap/MiniMap";
import { useEffect, useMemo, useState } from "react";
import { closeModal } from "state/actions/modal";
import { ObjectValues, ProjectConfig } from "utils/generatedTypes";
import { FileNameInput } from "./FileNameInput";

export const SaveLoadModalModeEnum = { load: "load", save: "save" } as const;
type SaveLoadModalMode = ObjectValues<typeof SaveLoadModalModeEnum>;
type SaveLoadConfigEntry = Pick<
  ProjectConfig,
  "id" | "name" | "previewImgColor" | "topLevelSections"
>;

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
  const [selectedConfigName, setSelectedConfigName] = useState<string | null>(null);
  const [filename, setFilename] = useState("");

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
  }, [open]);

  const existingByTypedName = useMemo(() => {
    const normalizedFilename = filename.trim();
    if (!normalizedFilename) {
      return null;
    }
    return sortedFiles.find((config) => config.name === normalizedFilename) ?? null;
  }, [filename, sortedFiles]);

  function onClose() {
    setSelectedConfigName(null);
    setFilename("");
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
        <p className="mt-1 text-xs text-setta-500 dark:text-setta-400">{helperText}</p>
      </header>

      <section className="min-h-0 flex-1 overflow-hidden rounded-xl border border-setta-200/70 p-2 dark:border-setta-800/80">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-setta-400">
            Project Configs
          </h3>
          <span className="text-[10px] uppercase tracking-[0.14em] text-setta-400">
            {sortedFiles.length}
          </span>
        </div>

        {sortedFiles.length === 0 ? (
          <div className="grid h-full place-items-center rounded-lg border border-dashed border-setta-200/70 text-xs text-setta-500 dark:border-setta-800/70 dark:text-setta-400">
            No saved project configs found.
          </div>
        ) : (
          <div className="grid max-h-full min-h-0 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
            {sortedFiles.map((config) => {
              const isSelected = selectedConfigName === config.name;
              const cardClasses = isSelected
                ? "border-blue-500/70 bg-blue-50/60 dark:border-blue-500/70 dark:bg-blue-950/30"
                : "border-setta-200 bg-white/70 hover:border-setta-300 hover:bg-white dark:border-setta-700 dark:bg-setta-900/40 dark:hover:border-setta-600 dark:hover:bg-setta-900/70";
              return (
                <button
                  key={config.id}
                  type="button"
                  data-testid="save-load-config-card"
                  data-config-name={config.name}
                  className={`flex min-h-[8.25rem] cursor-pointer flex-col overflow-hidden rounded-lg border text-left transition-colors ${cardClasses}`}
                  onClick={() => {
                    setSelectedConfigName(config.name);
                    if (modalMode === SaveLoadModalModeEnum.save) {
                      setFilename(config.name);
                    }
                  }}
                  onDoubleClick={() => {
                    if (modalMode !== SaveLoadModalModeEnum.load) {
                      return;
                    }
                    setSelectedConfigName(config.name);
                    onClickActionButton({
                      selectedName: config.name,
                      filename: config.name,
                    });
                    closeModal();
                    onClose();
                  }}
                >
                  <div
                    className={`h-[5.6rem] w-full p-2 ${config.previewImgColor || "bg-setta-100 dark:bg-setta-800"}`}
                  >
                    <div className="h-full w-full overflow-hidden rounded-md bg-white/35 dark:bg-setta-900/35">
                      <PreviewImg topLevelSections={config.topLevelSections} />
                    </div>
                  </div>
                  <div className="flex min-h-[2.6rem] items-center px-2 py-1">
                    <p className="truncate text-xs font-medium text-setta-700 dark:text-setta-200">
                      {config.name}
                    </p>
                  </div>
                </button>
              );
            })}
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

function PreviewImg({
  topLevelSections,
}: {
  topLevelSections: ProjectConfig["topLevelSections"];
}) {
  const sectionLayouts = Array.isArray(topLevelSections)
    ? topLevelSections
    : Object.values(topLevelSections);
  const nodes = sectionLayouts.map((section) => ({
    position: { x: section.x, y: section.y },
    width: section.w,
    height: section.h,
  }));

  const elementWidth = 200;
  const elementHeight = 150;
  const boundingRect = getNodesBounds(nodes);
  const { x, y, width, height, offset } = getXYWidthHeight({
    boundingRect,
    elementHeight,
    elementWidth,
    offsetScale: 5,
  });

  return MinimapSvg({
    elementWidth: 200,
    elementHeight: 150,
    x,
    y,
    width,
    height,
    offset,
    nodes,
    nodeColor: (node) => {
      if (node.className?.includes("selected")) return "#ffffff";
      return "#d6dee8";
    },
    nodeBorderRadius: 2,
    nodeStrokeWidth: 2,
    nodeStrokeColor: "transparent",
    maskColor: "rgba(255,255,255,0.35)",
    maskStrokeColor: "transparent",
    maskStrokeWidth: 1,
    shapeRendering: "geometricPrecision",
  });
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
