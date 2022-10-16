import Button from "./Button";

const MenuBarButton = ({ children, ...theRest }) => {
  return (
    <Button
      tailwindClasses="bg-white hover:bg-gray-100 text-xs font-bold text-gray-700 py-1 px-2 rounded-md gap-1"
      {...theRest}
    >
      {children}
    </Button>
  );
};

export default MenuBarButton;
