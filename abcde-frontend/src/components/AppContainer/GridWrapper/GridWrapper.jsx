export default function GridWrapper(props) {
  return (
    <StandardGrid {...props}>
      <FlexForm {...props}>{props.children}</FlexForm>
    </StandardGrid>
  );
}

function StandardGrid(props) {
  return (
    <div className="col-start-1 col-end-2 row-start-2 row-end-3 min-h-0 min-w-0 h-full">
      {props.children}
    </div>
  );
}

function FlexForm(props) {
  const { flexFormWrap = false } = props;
  if (flexFormWrap) {
    return (
      <div className="flex flex-col w-full min-h-[200px] mt-[20vh] justify-center items-center">
        {props.children}
      </div>
    );
  } else {
    return <>{props.children}</>;
  }
}
