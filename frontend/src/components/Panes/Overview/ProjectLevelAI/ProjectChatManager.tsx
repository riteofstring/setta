import { buildProjectChatWindowTitle } from "components/ChatWindowing/projectChatWindowTitles";
import _ from "lodash";
import { MdAdd } from "react-icons/md";
import {
  bootProjectChatWindowToCanvasSection,
  createProjectChatWindowInstance,
  focusProjectChatWindow,
  minimizeProjectChatWindow,
  reopenProjectChatWindow,
  undockProjectChatWindowFromCanvasSection,
} from "state/actions/projectChatWindowing";
import { useProjectState } from "state/definitions";
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

export function ProjectChatManager() {
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
    <section className="setta-pane-scroll min-h-0 flex-1 overflow-y-auto">
      <div className="flex items-center justify-between px-1 py-1">
        <p className="text-xs text-setta-500 dark:text-setta-400">
          Project chat windows open docked on the right and minimize into the
          bottom tray.
        </p>
        <button
          type="button"
          onClick={() => {
            const instanceId = createProjectChatWindowInstance();
            focusProjectChatWindow(instanceId);
          }}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-setta-300 bg-setta-50 px-2 text-xs font-semibold text-setta-700 transition-colors hover:bg-setta-100 dark:border-setta-700 dark:bg-setta-850 dark:text-setta-200 dark:hover:bg-setta-800"
        >
          <MdAdd size={14} /> New chat
        </button>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-setta-300 bg-setta-50/60 px-3 py-2 text-xs text-setta-600 dark:border-setta-700 dark:bg-setta-900/40 dark:text-setta-300">
          No chat windows yet.
        </div>
      ) : (
        <ul className="flex flex-col gap-2 py-1">
          {rows.map((row) => (
            <li
              key={row.instanceId}
              className="border-setta-250 rounded-md border bg-white px-2 py-2 text-xs text-setta-700 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-setta-900 dark:text-setta-100">
                    {buildProjectChatWindowTitle(
                      row.mode,
                      row.instanceId,
                      row.sectionIdOrNull,
                      row.title,
                      sectionNamesById,
                    )}
                  </p>
                  <p className="text-[11px] text-setta-500 dark:text-setta-400">
                    {formatPlacementLabel(row.placement)} | z-index {row.zIndex}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {row.placement === ChatWindowPlacementEnum.canvas_section ? (
                    <button
                      type="button"
                      onClick={() => {
                        undockProjectChatWindowFromCanvasSection(
                          row.instanceId,
                        );
                      }}
                      className="rounded-md border border-setta-300 px-2 py-1 text-[11px] font-semibold text-setta-700 hover:bg-setta-100 dark:border-setta-600 dark:text-setta-200 dark:hover:bg-setta-800"
                      data-testid="project-chat-window-undock-from-canvas"
                      data-chat-window-instance-id={row.instanceId}
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
                      }}
                      className="rounded-md border border-setta-300 px-2 py-1 text-[11px] font-semibold text-setta-700 hover:bg-setta-100 dark:border-setta-600 dark:text-setta-200 dark:hover:bg-setta-800"
                      data-testid="project-chat-window-move-to-canvas"
                      data-chat-window-instance-id={row.instanceId}
                    >
                      Canvas
                    </button>
                  )}
                  {row.isClosed ? (
                    <button
                      type="button"
                      onClick={() => {
                        reopenProjectChatWindow(row.instanceId);
                        focusProjectChatWindow(row.instanceId);
                      }}
                      className="rounded-md border border-setta-300 px-2 py-1 text-[11px] font-semibold text-setta-700 hover:bg-setta-100 dark:border-setta-600 dark:text-setta-200 dark:hover:bg-setta-800"
                    >
                      Reopen
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        minimizeProjectChatWindow(row.instanceId);
                      }}
                      className="rounded-md border border-setta-300 px-2 py-1 text-[11px] font-semibold text-setta-700 hover:bg-setta-100 dark:border-setta-600 dark:text-setta-200 dark:hover:bg-setta-800"
                    >
                      Hide
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      reopenProjectChatWindow(row.instanceId);
                      focusProjectChatWindow(row.instanceId);
                    }}
                    className="rounded-md border border-setta-300 px-2 py-1 text-[11px] font-semibold text-setta-700 hover:bg-setta-100 dark:border-setta-600 dark:text-setta-200 dark:hover:bg-setta-800"
                  >
                    Focus
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
