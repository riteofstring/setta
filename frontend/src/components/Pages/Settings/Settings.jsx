import { dbSaveSettings } from "requests/settings";
import { useSettings } from "state/definitions";
import { useGoBackOrToHome } from "state/hooks/utils";
import { ShortcutSettings } from "./ShortcutSettings";
import { SimpleSettings } from "./SimpleSettings";

export function Settings() {
  const goBackOrToHome = useGoBackOrToHome();
  function saveSettings() {
    dbSaveSettings(useSettings.getState());
  }

  return (
    <div className="h-dvh w-dvw overflow-y-scroll bg-setta-100 dark:bg-setta-850">
      <section className="mx-auto flex w-[clamp(200px,_50vw,_800px)] flex-col pb-24">
        <header className="flex justify-between pb-4 pt-4">
          <h1 className=" font-heading text-3xl font-bold text-setta-300 dark:text-setta-700">
            Settings
          </h1>

          <button
            onClick={goBackOrToHome}
            className="flex-start flex cursor-pointer items-center rounded-xl border border-solid border-setta-400 border-transparent py-1 pl-1 pr-4 text-lg font-bold text-setta-600 hover:bg-setta-200 dark:border-setta-800 dark:text-setta-300 dark:hover:bg-setta-700"
          >
            <i className="gg-arrow-left" />
            Back
          </button>
        </header>

        <h2 className="mb-4 border-b border-setta-200 pt-4 font-heading text-xl font-bold text-setta-600 dark:border-setta-700 dark:text-setta-500">
          General
        </h2>
        <SimpleSettings />
        <h2 className="mb-4 border-b border-setta-200 pt-8 font-heading text-xl font-bold text-setta-600 dark:border-setta-700 dark:text-setta-500">
          Keyboard Shortcuts
        </h2>
        <ShortcutSettings />
        <button
          onClick={saveSettings}
          className="ml-auto mt-8 flex w-min cursor-pointer items-center justify-center rounded-xl border border-solid border-setta-400 px-3 py-1 text-lg font-bold text-setta-600 hover:bg-setta-200 dark:border-setta-500 dark:bg-setta-900 dark:text-setta-300 dark:hover:bg-setta-700"
        >
          Save
        </button>
      </section>
    </div>
  );
}
