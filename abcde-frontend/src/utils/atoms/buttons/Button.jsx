export default function Button(props) {
  const { tailwindClasses = "", as, children, ...theRest } = props;

  const classes = `transition-colors duration-150 focus:shadow-outline inline-flex items-center ${tailwindClasses} `;

  if (as === "link") {
    return (
      <a href={href} className={classes} {...theRest}>
        {children}
      </a>
    );
  }

  return (
    <button className={classes} {...theRest}>
      {children}
    </button>
  );
}
