export function StandardInput({ twClasses, ...theRest }) {
  const classes = `nodrag border-0 border-b cursor-auto border-runcoder-300 dark:border-runcoder-600 border-solid text-xs dark:text-runcoder-300 font-code pb-1 focus-visible:border-blue-400 ${twClasses}`;

  return <input {...theRest} className={classes} />;
}
