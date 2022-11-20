export default function GridWrapper(props) {
  return (
    <StandardGrid {...props}>
      <FlexForm {...props}>{props.children}</FlexForm>
    </StandardGrid>
  );
}

function StandardGrid(props) {
  const { gridProps } = props;
  return (
    <div
      className={`grid grid-col-[1fr] grid-row-[1fr] col-start-1 col-end-2 row-start-2 row-end-3 min-h-0 min-w-0 h-full ${gridProps}`}
    >
      {props.children}
    </div>
  );
}

function FlexForm(props) {
  const { flexFormWrap = false } = props;
  if (flexFormWrap) {
    return (
      <div className="flex flex-col w-full min-h-[200px] justify-center items-center">
        {props.children}
      </div>
    );
  } else {
    return <>{props.children}</>;
  }
}
