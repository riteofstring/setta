export function StandardInput({ twClasses, ...theRest }) {
  const classes = `nodrag border-0 border-b cursor-auto border-slate-400 border-solid text-sm dark:text-slate-300 font-code pb-1 focus-visible:border-blue-400 ${twClasses}`;

  return <input {...theRest} className={classes} />;
}
