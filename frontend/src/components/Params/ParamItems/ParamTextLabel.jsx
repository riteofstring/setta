import { useCodeInfo } from "state/definitions";

export function ParamTextLabel({ paramInfoId }) {
  const name = useCodeInfo((x) => x.x[paramInfoId].name);

  return (
    <p className="section-key truncate py-[.125rem] font-sans text-xs font-semibold  text-setta-800 dark:text-setta-200">
      {name}
    </p>
  );
}
