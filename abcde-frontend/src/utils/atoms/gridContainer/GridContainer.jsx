export function GridContainer({ children }) {
  return (
    <main className="h-full w-screen overflow-hidden grid grid-cols-[1fr] grid-rows-[min-content]">
      {children}
    </main>
  );
}
