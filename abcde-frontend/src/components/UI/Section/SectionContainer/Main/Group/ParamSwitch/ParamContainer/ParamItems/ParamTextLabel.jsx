export function ParamTextLabel(props) {
  return (
    <p className="truncate whitespace-nowrap font-heading text-xs font-black text-slate-600">
      {props.paramInfo.name}
    </p>
  );
}
