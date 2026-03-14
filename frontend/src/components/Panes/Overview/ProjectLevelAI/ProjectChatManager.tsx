import { buildProjectChatWindowTitle } from "components/ChatWindowing/projectChatWindowTitles";
import { getWindowControlQuickInfoHandlers } from "components/Utils/windowControlQuickInfo";
import _ from "lodash";
import {
  focusProjectChatWindow,
  minimizeProjectChatWindow,
  reopenProjectChatWindow,
  undockProjectChatWindowFromCanvasSection,
} from "state/actions/projectChatWindowing";
import { bootProjectChatWindowToCanvasSection } from "state/actions/projectChatWindowingCanvasBoot";
import { useProjectState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import {
  ChatWindowPlacementEnum,
  type ChatWindowMode,
} from "utils/generatedTypes";

type ChatWindowManagerRow = {
  instanceId: string;
  placement: (typeof ChatWindowPlacementEnum)[keyof typeof ChatWindowPlacementEnum];
  mode: ChatWindowMode;
  isClosed: boolean;
  isMinimized: boolean;
  zIndex: number;
  sectionIdOrNull: string | null;
  title: string | null;
};

type ProjectChatManagerProps = {
  onAfterAction?: () => void;
};

function formatPlacementLabel(
  placement: (typeof ChatWindowPlacementEnum)[keyof typeof ChatWindowPlacementEnum],
): string {
  if (placement === ChatWindowPlacementEnum.bottom_docked) {
    return "bottom dock";
  }
  if (placement === ChatWindowPlacementEnum.canvas_section) {
    return "canvas section";
  }
  return placement;
}

export function ProjectChatManager({
  onAfterAction,
}: ProjectChatManagerProps = {}) {
  const { canEditLayout } = useShareCapabilities();
  const { order, instancesById, sectionNamesById } = useProjectState(
    (state) => ({
      order: state.projectChatWindowing.order,
      instancesById: state.projectChatWindowing.instancesById,
      sectionNamesById: Object.fromEntries(
        Object.entries(state.sections).map(([sectionId, section]) => [
          sectionId,
          section.name,
        ]),
      ),
    }),
    _.isEqual,
  );
  const rows = _.compact(
    order.map((instanceId): ChatWindowManagerRow | null => {
      const instance = instancesById[instanceId];
      if (!instance) {
        return null;
      }
      return {
        instanceId,
        placement: instance.placement,
        mode: instance.mode,
        isClosed: instance.isClosed,
        isMinimized: instance.isMinimized,
        zIndex: instance.zIndex,
        sectionIdOrNull: instance.sectionIdOrNull,
        title: instance.title ?? null,
      };
    }),
  );

  return (
    <section className="setta-pane-scroll flex max-h-[24rem] min-h-0 min-w-[20rem] flex-col overflow-y-auto">
      <div className="px-2 pb-2 pt-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-setta-400 dark:text-setta-500">
          Chat windows
        </p>
        <p className="pt-1 text-[11px] text-setta-500 dark:text-setta-400">
          Focus, reopen, and move chat windows from the dock.
        </p>
      </div>
      {rows.length === 0 ? (
        <div className="mx-2 mb-2 rounded-md border border-dashed border-setta-300 bg-setta-50/60 px-3 py-2 text-xs text-setta-600 dark:border-setta-700 dark:bg-setta-900/40 dark:text-setta-300">
          No chat windows yet. Use + in the dock to create one.
        </div>
      ) : (
        <ul className="flex flex-col gap-2 px-2 py-1 pb-2">
          {rows.map((row) => {
            const rowTitle = buildProjectChatWindowTitle(
              row.mode,
              row.instanceId,
              row.sectionIdOrNull,
              row.title,
              sectionNamesById,
            );

            return (
              <li
                key={row.instanceId}
                className="border-setta-250 rounded-md border bg-setta-50/80 px-2 py-2 text-xs text-setta-700 dark:border-setta-700 dark:bg-setta-925/95 dark:text-setta-200"
                data-testid="project-chat-bottom-dock-menu-item"
                data-chat-window-instance-id={row.instanceId}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-setta-900 dark:text-setta-100">
                      {rowTitle}
                    </p>
                    <p className="text-[11px] text-setta-500 dark:text-setta-400">
                      {formatPlacementLabel(row.placement)} | z-index{" "}
                      {row.zIndex}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {canEditLayout ? (
                      row.placement ===
                      ChatWindowPlacementEnum.canvas_section ? (
                        <button
                          type="button"
                          onClick={() => {
                            undockProjectChatWindowFromCanvasSection(
                              row.instanceId,
                            );
                            onAfterAction?.();
                          }}
                          className="rounded-md border border-setta-300 px-2 py-1 text-[11px] font-semibold text-setta-700 hover:bg-setta-100 dark:border-setta-600 dark:text-setta-200 dark:hover:bg-setta-800"
                          data-testid="project-chat-window-undock-from-canvas"
                          data-chat-window-instance-id={row.instanceId}
                          {...getWindowControlQuickInfoHandlers({
                            action: "float_window",
                            title: rowTitle,
                          })}
                        >
                          Float
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            void bootProjectChatWindowToCanvasSection(
                              row.instanceId,
                            );
                            onAfterAction?.();
                          }}
                          className="rounded-md border border-setta-300 px-2 py-1 text-[11px] font-semibold text-setta-700 hover:bg-setta-100 dark:border-setta-600 dark:text-setta-200 dark:hover:bg-setta-800"
                          data-testid="project-chat-window-move-to-canvas"
                          data-chat-window-instance-id={row.instanceId}
                          {...getWindowControlQuickInfoHandlers({
                            action: "show_in_canvas",
                            title: rowTitle,
                          })}
                        >
                          Canvas
                        </button>
                      )
                    ) : null}
                    {row.isClosed || row.isMinimized ? (
                      <button
                        type="button"
                        onClick={() => {
                          reopenProjectChatWindow(row.instanceId);
                          focusProjectChatWindow(row.instanceId);
                          onAfterAction?.();
                        }}
                        className="rounded-md border border-setta-300 px-2 py-1 text-[11px] font-semibold text-setta-700 hover:bg-setta-100 dark:border-setta-600 dark:text-setta-200 dark:hover:bg-setta-800"
                        data-testid="project-chat-manager-reopen"
                        data-chat-window-instance-id={row.instanceId}
                        {...getWindowControlQuickInfoHandlers({
                          action: "reopen_window",
                          title: rowTitle,
                        })}
                      >
                        Reopen
                      </button>
                    ) : canEditLayout ? (
                      <button
                        type="button"
                        onClick={() => {
                          minimizeProjectChatWindow(row.instanceId);
                          onAfterAction?.();
                        }}
                        className="rounded-md border border-setta-300 px-2 py-1 text-[11px] font-semibold text-setta-700 hover:bg-setta-100 dark:border-setta-600 dark:text-setta-200 dark:hover:bg-setta-800"
                        data-testid="project-chat-manager-hide"
                        data-chat-window-instance-id={row.instanceId}
                        {...getWindowControlQuickInfoHandlers({
                          action: "hide_window",
                          title: rowTitle,
                        })}
                      >
                        Hide
                      </button>
                    ) : null}
                    {row.isClosed || row.isMinimized ? null : (
                      <button
                        type="button"
                        onClick={() => {
                          focusProjectChatWindow(row.instanceId);
                          onAfterAction?.();
                        }}
                        className="rounded-md border border-setta-300 px-2 py-1 text-[11px] font-semibold text-setta-700 hover:bg-setta-100 dark:border-setta-600 dark:text-setta-200 dark:hover:bg-setta-800"
                        data-testid="project-chat-manager-focus"
                        data-chat-window-instance-id={row.instanceId}
                        {...getWindowControlQuickInfoHandlers({
                          action: "focus_window",
                          title: rowTitle,
                        })}
                      >
                        Focus
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
