export default function Badge(props) {
  const { tailwindClasses, children } = props;

  const classes = `${tailwindClasses} inline-block whitespace-nowrap align-middle px-1 uppercase text-xs rounded-sm font-bold`;

  return <span className={classes}>{children}</span>;
}
