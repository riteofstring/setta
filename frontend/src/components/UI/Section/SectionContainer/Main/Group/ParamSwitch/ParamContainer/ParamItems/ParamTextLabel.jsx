export function ParamTextLabel(props) {
  return (
    <p className="self-center truncate whitespace-nowrap font-sans text-xs font-semibold  text-slate-800 dark:text-slate-400">
      {props.paramInfo.name}
    </p>
  );
}
