export function FlexWrapper({ children }) {
  return <div className="flex flex-col">{children}</div>;
}

export function PageSection({ children }) {
  return <section className="px-11">{children}</section>;
}
