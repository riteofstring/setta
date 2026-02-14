import { IdNameCombobox } from "components/Utils/Combobox/IdNameCombobox";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { WORKSPACE_LAUNCH_ROUTER_PATH } from "utils/constants";
import { res200 } from "utils/endpointUtils";
import { route_get_backend_init_status } from "utils/generatedEndpoints";
import { writePendingWorkspaceLaunch } from "utils/workspaceSwitcherLaunch";
import {
  buildWorktreeLaunchRequest,
  getActiveWorktreeOptionId,
  normalizeWorktreeOptions,
} from "./worktreeOptions";

type LoadState = "loading" | "ready" | "error";

export function WorktreeCombobox() {
  const navigate = useNavigate();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [options, setOptions] = useState<
    Array<{ id: string; name: string; path: string; isActive: boolean }>
  >([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadWorktreeOptions() {
      const res = await route_get_backend_init_status();
      if (!isMounted) {
        return;
      }
      if (!res200(res)) {
        setLoadState("error");
        return;
      }
      const nextOptions = normalizeWorktreeOptions(
        res.data.worktreeOptionDetails ?? [],
      );
      setOptions(nextOptions);
      setSelectedId(getActiveWorktreeOptionId(nextOptions));
      setLoadState("ready");
    }

    void loadWorktreeOptions();
    return () => {
      isMounted = false;
    };
  }, []);

  const comboboxItems = useMemo(
    () => [
      {
        group: "Worktrees",
        items: options.map((option) => ({
          id: option.id,
          name: option.name,
        })),
      },
    ],
    [options],
  );

  const canSelectWorktree = loadState === "ready" && options.length > 0;
  const statusLabel = (() => {
    if (loadState === "loading") {
      return "Loading worktrees…";
    }
    if (loadState === "error") {
      return "Failed to load worktrees";
    }
    if (options.length === 0) {
      return "No worktrees found";
    }
    return null;
  })();

  return (
    <aside
      className="relative z-10 mr-2 flex min-w-[220px] max-w-[320px] items-center gap-2"
      data-testid="worktree-combobox"
    >
      <label
        htmlFor="worktree-combobox"
        className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.2em] text-setta-400 dark:text-setta-500"
      >
        Worktree
      </label>
      {statusLabel ? (
        <p
          data-testid="worktree-combobox-status"
          className={`min-w-0 truncate text-xs ${
            loadState === "error"
              ? "text-red-500 dark:text-red-400"
              : "text-setta-500 dark:text-setta-400"
          }`}
        >
          {statusLabel}
        </p>
      ) : (
        <IdNameCombobox
          inputDivId="worktree-combobox"
          allItems={comboboxItems}
          value={selectedId}
          onSelectedItemChange={(nextId) => {
            if (!nextId || isSwitching) {
              return;
            }
            const nextOption = options.find((option) => option.id === nextId);
            if (!nextOption || nextOption.isActive) {
              return;
            }
            setIsSwitching(true);
            setSelectedId(nextOption.id);
            writePendingWorkspaceLaunch({
              request: buildWorktreeLaunchRequest(nextOption.path),
              returnUrl:
                typeof window !== "undefined" ? window.location.href : "/home",
              requestedAt: Date.now(),
            });
            navigate(WORKSPACE_LAUNCH_ROUTER_PATH);
          }}
          small
          variant="pane"
          placeholder="Select worktree"
          isDisabled={!canSelectWorktree || isSwitching}
          selectedItemCanBeNull={false}
          inputOuterClasses="h-6"
          inputThemeClassName="!h-6 !rounded-md !border-setta-200 !text-[11px] !font-semibold !tracking-wide dark:!border-setta-700"
          rightButtonThemeClassName="!h-5 !w-5 !rounded-[5px]"
          itemThemeClassName="!text-[11px]"
          itemHighlightedThemeClassName="!bg-blue-100 dark:!bg-blue-950/40"
          outerDivClasses="min-w-0"
        />
      )}
    </aside>
  );
}
