export default function Badge(props) {
  const { twClasses, children } = props;

  const classes = `${twClasses} inline-block whitespace-nowrap align-middle px-1 py-[0.1rem] text-xs rounded-md font-bold`;

  return <span className={classes}>{children}</span>;
}
