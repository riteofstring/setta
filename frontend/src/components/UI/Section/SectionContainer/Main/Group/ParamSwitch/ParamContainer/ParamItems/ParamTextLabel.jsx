export function ParamTextLabel(props) {
  return (
    <p
      className="card-key truncate font-sans text-xs font-semibold  text-runcoder-800 dark:text-runcoder-400"
      onClick={props.onNameClick}
    >
      {props.paramInfo.name}
    </p>
  );
}
