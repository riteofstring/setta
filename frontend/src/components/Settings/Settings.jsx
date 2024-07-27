import { useGoBackOrToHome } from "state/hooks/utils";
import { ShortcutSettings } from "./ShortcutSettings";
import { SimpleSettings } from "./SimpleSettings";

export function Settings() {
  const goBackOrToHome = useGoBackOrToHome();
  return (
    <div className="h-dvh w-dvw overflow-y-scroll">
      <section className="mx-auto flex w-[clamp(200px,_50vw,_800px)] flex-col pb-24">
        <header className="flex justify-between pb-4 pt-4">
          <h1 className=" font-heading text-3xl font-bold text-setta-700 dark:text-setta-600">
            Settings
          </h1>
          <button
            onClick={goBackOrToHome}
            className="flex-start flex cursor-pointer items-center rounded-xl border border-solid border-setta-400 border-transparent py-1 pl-1 pr-4 text-setta-600 hover:bg-setta-200 dark:border-setta-800 dark:text-setta-300 dark:hover:bg-setta-700"
          >
            <i className="gg-arrow-left" />
            <p className="text-lg font-bold">Back</p>
          </button>
        </header>

        <h2 className="pb-4 pt-4 font-heading text-xl font-bold text-setta-600 dark:text-setta-600">
          General
        </h2>
        <SimpleSettings />
        <h2 className="pb-4 pt-8 font-heading text-xl font-bold text-setta-600 dark:text-setta-600">
          Keyboard Shortcuts
        </h2>
        <ShortcutSettings />
      </section>
    </div>
  );
}
