import { ShortcutSettings } from "./ShortcutSettings";
import { SimpleSettings } from "./SimpleSettings";

export function Settings() {
  return (
    <section className="col flex w-[clamp(200px,_50vw,_800px)] flex-col justify-self-center">
      <h1 className="pb-4 pt-8 font-heading text-3xl font-bold text-runcoder-500 dark:text-runcoder-600">
        Settings
      </h1>
      <h2 className="pb-4 pt-4 font-heading text-xl font-bold text-runcoder-500 dark:text-runcoder-600">
        General
      </h2>
      <SimpleSettings />
      <h2 className="pb-4 pt-8 font-heading text-xl font-bold text-runcoder-500 dark:text-runcoder-600">
        Keyboard Shortcuts
      </h2>
      <ShortcutSettings />
    </section>
  );
}
