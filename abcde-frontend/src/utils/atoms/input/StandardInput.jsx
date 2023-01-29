export function StandardInput({ twClasses, ...theRest }) {
  const classes = `border-0 border-b cursor-auto border-gray-200 border-solid text-xs max-w-[10rem] pb-1 focus-visible:border-blue-400 ${twClasses}`;

  return <input {...theRest} className={classes} />;
}
