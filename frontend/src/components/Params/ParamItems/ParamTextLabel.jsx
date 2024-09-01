export function ParamTextLabel(props) {
  return (
    <p className="section-key truncate py-[.125rem] font-sans text-xs font-semibold  text-setta-800 dark:text-setta-400">
      {props.paramInfo.name}
    </p>
  );
}
