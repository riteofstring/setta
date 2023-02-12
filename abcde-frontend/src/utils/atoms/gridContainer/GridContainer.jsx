export function GridContainer({ children }) {
  return (
    <main className="grid h-full w-screen grid-cols-[1fr] grid-rows-[min-content] overflow-hidden">
      {children}
    </main>
  );
}
