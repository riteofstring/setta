export function ParamTextLabel(props) {
  return (
    <p className="flex-1 truncate font-sans text-xs font-semibold  text-runcoder-800 dark:text-runcoder-400">
      {props.paramInfo.name}
    </p>
  );
}
