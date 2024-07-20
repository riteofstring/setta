import { useNotification } from "state/definitions/notification";
import { VscSave } from "react-icons/vsc";

export function Notification() {
  const message = useNotification((x) => x.message);

  return (
    message && (
      <>
        <VscSave className="ml-4 h-3 w-3 text-setta-400 dark:text-setta-50" />
        <p className="ml-2 self-center text-xs text-setta-500 dark:text-setta-100">
          {message}
        </p>
      </>
    )
  );
}
