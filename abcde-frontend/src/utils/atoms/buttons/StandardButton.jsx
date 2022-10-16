import Button from "./Button";

export default function MenuBarButton({ children, ...theRest }) {
  return (
    <Button
      tailwindClasses="bg-gray-500 hover:bg-gray-700 white font-bold py-2 px-4 rounded-full gap-1"
      {...theRest}
    >
      {children}
    </Button>
  );
}
