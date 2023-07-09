import { useNotification } from "models/notification";

export function Notification() {
  const message = useNotification((x) => x.message);

  return (
    <>
      <p className="self-center text-xs text-slate-400">{message}</p>
    </>
  );
}
