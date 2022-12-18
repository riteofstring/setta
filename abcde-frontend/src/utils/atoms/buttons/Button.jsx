import React from "react";

export default React.forwardRef((props, ref) => {
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
    <button className={classes} {...theRest} ref={ref}>
      {children}
    </button>
  );
});
