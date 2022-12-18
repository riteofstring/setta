export default function StandardInput({ twClasses, ...theRest }) {
  const classes = `border-0 border-b cursor-auto border-gray-200 border-solid text-xs max-w-[10rem] pb-1 focus:border-blue-300 ${twClasses}`;

  return <input {...theRest} className={classes} />;
}
