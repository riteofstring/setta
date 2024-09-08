export function ParamTextLabel(props) {
  return (
    <p className="section-key truncate font-sans text-xs font-semibold  text-setta-800 dark:text-setta-400">
      {props.paramInfo.name}
    </p>
  );
}
