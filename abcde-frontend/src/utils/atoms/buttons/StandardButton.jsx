import Button from "./Button";

export function StandardButton({ children, ...theRest }) {
  return (
    <Button
      tailwindClasses="bg-gray-50 hover:bg-gray-200 white font-bold py-2 px-4 rounded-full gap-1"
      {...theRest}
    >
      {children}
    </Button>
  );
}
