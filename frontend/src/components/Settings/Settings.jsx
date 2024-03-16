import { ShortcutSettings } from "./ShortcutSettings";
import { SimpleSettings } from "./SimpleSettings";

export function Settings() {
  return (
    <>
      <SimpleSettings />
      <ShortcutSettings />
    </>
  );
}
