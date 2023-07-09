export function ParamTextLabel(props) {
  return (
    <p className="truncate whitespace-nowrap font-body text-xs font-semibold  text-slate-800">
      {props.paramInfo.name}
    </p>
  );
}
