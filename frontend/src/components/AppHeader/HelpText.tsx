import { useEffect, useState } from "react";
import { useLocalStorage, useSettings } from "state/definitions";
import { shortcutPrettified } from "utils/utils";

const HELP_TEXT_FADE_MS = 150;

export function HelpText() {
  const showMessage = useLocalStorage((x) => x.showNavBarHelpMessage);
  const shortcut = useSettings((x) =>
    shortcutPrettified(x.shortcuts.showTooltipShortcut),
  );

  const shouldShow = showMessage;

  const [mounted, setMounted] = useState(shouldShow);
  const [isVisible, setIsVisible] = useState(shouldShow);

  useEffect(() => {
    if (shouldShow) {
      setMounted(true);
      setIsVisible(false);
      requestAnimationFrame(() => {
        setIsVisible(true);
      });
      return;
    }

    setIsVisible(false);
    const timeoutId = window.setTimeout(() => {
      setMounted(false);
    }, HELP_TEXT_FADE_MS);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [shouldShow]);

  return (
    mounted && (
      <aside
        className={[
          "ml-auto mr-4 flex items-center gap-2 transition-opacity duration-150 ease-out",
          isVisible ? "opacity-100" : "opacity-0",
        ].join(" ")}
      >
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
    )
  );
}
