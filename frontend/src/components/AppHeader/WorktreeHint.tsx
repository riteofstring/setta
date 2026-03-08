import { useEffect, useState } from "react";
import { IoMdGitBranch } from "react-icons/io";
import { res200 } from "utils/endpointUtils";
import { route_get_backend_init_status } from "utils/generatedGoEndpoints";

export function WorktreeHint() {
  const [worktreeName, setWorktreeName] = useState<string | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function fn() {
      const res = await route_get_backend_init_status();
      if (!isMounted) {
        return;
      }
      if (!res200(res)) {
        setWorktreeName(null);
        return;
      }
      setWorktreeName(res.data.worktreeName ?? null);
    }

    fn();
    return () => {
      isMounted = false;
    };
  }, []);

  if (isDismissed || !worktreeName) {
    return null;
  }

  return (
    <aside
      className="relative z-10 flex items-center gap-2"
      data-testid="worktree-hint"
    >
      <div className="hidden items-center gap-1 lg:flex">
        <IoMdGitBranch
          aria-hidden="true"
          className="h-3.5 w-3.5 text-setta-400 dark:text-setta-500"
        />
        <p
          className="text-[11px] font-medium text-setta-400 dark:text-setta-500"
          title={worktreeName}
        >
          {worktreeName}
        </p>
        <button
          aria-label="Close worktree label"
          className="flex cursor-pointer items-center text-setta-300 hover:text-setta-700 dark:text-setta-500 dark:hover:text-setta-400"
          data-testid="worktree-hint-close"
          onClick={() => setIsDismissed(true)}
          type="button"
        >
          <i className="gg-close" />
        </button>
      </div>
    </aside>
  );
}
