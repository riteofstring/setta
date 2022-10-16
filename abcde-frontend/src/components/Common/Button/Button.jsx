const Button = (props) => {
  const {
    bg = "bg-gray-500",
    hover = "hover:bg-gray-700",
    text = "white",
    weight = "font-bold",
    py = "py-2",
    px = "px-4",
    borderRadius = "rounded-full",
    display = "inline-flex",
    align = "items-center",
    gap = "gap-1",
    size,
    as,
    href = "#",
    classAttrs = "",
    children,
    ...theRest
  } = props;

  const textSize =
    size === "lg" ? "lg" : size === "sm" ? "sm" : size === "xs" ? "xs" : " ";

  const tailwindClasses = `${bg} ${hover} ${text} ${weight} ${py} ${px} ${borderRadius} ${display} ${align} text-${textSize} ${gap} transition-colors duration-150 focus:shadow-outline ${classAttrs}`;

  if (as === "link") {
    return (
      <a href={href} className={tailwindClasses} {...theRest}>
        {children}
      </a>
    );
  }

  return (
    <button className={tailwindClasses} {...theRest}>
      {children}
    </button>
  );
};

export default Button;
