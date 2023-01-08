export default function Badge(props) {
  const { twClasses, children } = props;

  const classes = `${twClasses} inline-block whitespace-nowrap align-middle px-1 uppercase text-xs rounded-sm font-bold`;

  return <span className={classes}>{children}</span>;
}
