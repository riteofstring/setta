import { useStateVersion } from "models/stateVersion";

export function StateCounter() {
  const version = useStateVersion((x) => x.version);

  return (
    <>
      <p className="self-center text-xs text-slate-400">{version}</p>
    </>
  );
}
