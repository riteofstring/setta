export function ParamTextLabel(props) {
  return (
    <h2 className="truncate whitespace-nowrap font-heading text-xs font-black text-slate-600">
      {props.paramInfo.name}
    </h2>
  );
}
