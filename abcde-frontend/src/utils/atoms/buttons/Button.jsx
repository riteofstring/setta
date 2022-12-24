import React from "react";

export default React.forwardRef((props, ref) => {
  const {
    tailwindClasses = "",
    grid = false,
    as,
    children,
    ...theRest
  } = props;
  const gridStatus = grid
    ? "grid place-items-center"
    : "inline-flex items-center";

  const classes = `transition-colors duration-150 focus-visible:ring-2 ${gridStatus} nodrag cursor-pointer ${tailwindClasses} `;

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
