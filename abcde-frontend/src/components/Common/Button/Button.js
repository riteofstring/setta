const Button = (props) => {
  const {
    bg = "bg-gray-500",
    hover = "bg-blue-700",
    text = "text-white",
    weight = "font-bold",
    py = "py-2",
    px = "px-4",
    borderRadius = "rounded-full",
    display = "inline-flex",
    align = "items-center",
    size = "lg" ? "text-lg" : "sm" ? "text-sm" : " ",
    as,
    href = "#",
    classAttrs,
    children,
    ...theRest
  } = props;

  const tailwindClasses = `${bg} ${hover} ${text} ${weight} ${py} ${px} ${borderRadius} ${display} ${align} ${size} transition-colors duration-150 focus:shadow-outline ${classAttrs}`;

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
