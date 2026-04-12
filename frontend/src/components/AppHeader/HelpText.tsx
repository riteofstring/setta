import { useLocalStorage, useSettings } from "state/definitions";
import { shortcutPrettified } from "utils/utils";

export function HelpText() {
  const showMessage = useLocalStorage((x) => x.showNavBarHelpMessage);
  const shortcut = useSettings((x) =>
    shortcutPrettified(x.shortcuts.showTooltipShortcut),
  );

  if (!showMessage) {
    return null;
  }

  return (
    <aside className="relative z-10 ml-auto mr-4 flex items-center gap-2">
      <div className="hidden items-center gap-2 lg:flex">
        <p className="text-xs font-bold text-setta-400 dark:text-setta-500">
          Hold &quot;{shortcut}&quot; for tool tips
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
  );
}
