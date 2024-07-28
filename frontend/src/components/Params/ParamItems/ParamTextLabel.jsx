export function ParamTextLabel(props) {
  return (
    <p
      className="single-cell-child truncate font-sans text-xs font-semibold  text-setta-800 dark:text-setta-400"
      onClick={props.onNameClick}
    >
      {props.paramInfo.name}
    </p>
  );
}
