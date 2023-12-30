import { useNotification } from "models/notification";
import { VscSave } from "react-icons/vsc";

export function Notification() {
  const message = useNotification((x) => x.message);

  return (
    message && (
      <>
        <VscSave className="ml-4 h-3 w-3 text-slate-400 dark:text-runcoder-50" />
        <p className="ml-2 self-center text-xs text-slate-500 dark:text-runcoder-100">
          {message}
        </p>
      </>
    )
  );
}
