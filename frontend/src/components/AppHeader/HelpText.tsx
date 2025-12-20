import { useLocalStorage, useSettings } from "state/definitions";
import { shortcutPrettified } from "utils/utils";

export function HelpText() {
  const showMessage = useLocalStorage((x) => x.showNavBarHelpMessage);
  const shortcut = useSettings((x) =>
    shortcutPrettified(x.shortcuts.showTooltipShortcut),
  );

  return (
    showMessage && (
      <aside className="ml-auto mr-4 flex items-center gap-2">
        <div className="hidden items-center gap-2 lg:flex">
          <p className="text-xs font-bold text-setta-400 dark:text-setta-500">
            Hold down &quot;{shortcut}&quot; to see tool tips
          </p>
          <button
            className="flex cursor-pointer items-center text-setta-300 hover:text-setta-700 dark:text-setta-500 dark:hover:text-setta-400"
            onClick={() =>
              useLocalStorage.setState({ showNavBarHelpMessage: false })
            }
          >
            <i className="gg-close" />
          </button>
        </div>
      </aside>
    )
  );
}
