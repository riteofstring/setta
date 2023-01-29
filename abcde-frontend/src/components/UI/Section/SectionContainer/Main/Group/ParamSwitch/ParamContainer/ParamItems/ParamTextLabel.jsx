export function ParamTextLabel(props) {
  return (
    <h2 className="text-xs font-black font-heading text-gray-600">
      {props.paramInfo.name}
    </h2>
  );
}
