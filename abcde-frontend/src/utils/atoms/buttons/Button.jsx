import React from "react";

export const Button = React.forwardRef((props, ref) => {
  const { twClasses = "", grid = false, as, children, ...theRest } = props;
  const gridStatus = grid
    ? "grid place-items-center"
    : "inline-flex items-center";

  const classes = `transition-colors duration-150 focus-visible:ring-2 ${gridStatus} nodrag cursor-pointer ${twClasses} `;

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
