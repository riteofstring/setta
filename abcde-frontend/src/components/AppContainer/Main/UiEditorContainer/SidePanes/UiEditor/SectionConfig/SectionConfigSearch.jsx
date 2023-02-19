import { StandardSearch } from "utils/atoms/search/StandardSearch";
import { checkboxChangeFn, radioChangeFn } from "utils/utils";

export function SectionConfigSearch({
  sectionId,
  onSelectionChange,
  onSearch,
  selected,
  results,
  isCheckbox,
  DetailsComponent,
}) {
  return (
    <div
      className="flex h-[inherit] flex-grow flex-col overflow-y-hidden [&>form]:flex-grow-0"
      data-testid={`SectionConfig ${sectionId}`}
    >
      <Search onSubmit={onSearch} />
      <ul className="mt-4 flex flex-grow flex-col gap-4 overflow-y-auto">
        {Object.values(results).map((x) => (
          <SearchItem
            id={x.id}
            name={x.name}
            description={x.description}
            details={x.children}
            checked={selected.includes(x.id)}
            onSelectionChange={onSelectionChange}
            isCheckbox={isCheckbox}
            key={`SearchItem-${x.id}`}
            DetailsComponent={DetailsComponent}
          />
        ))}
      </ul>
    </div>
  );
}

function Search({ onSubmit }) {
  function onFormSubmit(e) {
    e.preventDefault();
    onSubmit(e.target[0].value);
  }

  const inputStyles =
    "flex-grow text-sm outline-0 cursor-auto bg-transparent [border-width:0_0_1px_0] border-solid border-slate-300  focus-visible:border-blue-300 pl-7 py-1 ";

  return (
    <StandardSearch inputStyles={inputStyles} onFormSubmit={onFormSubmit} />
  );
}

function SearchItem({
  id,
  name,
  description = "",
  details,
  checked,
  onSelectionChange,
  isCheckbox,
  DetailsComponent,
}) {
  function onChange(e) {
    onSelectionChange({
      newValueFn: isCheckbox
        ? checkboxChangeFn(e.target.checked, id)
        : radioChangeFn(e.target.checked, id),
      id,
    });
  }

  // deal with tabbing
  return (
    <li className="edit-list-item flex select-none rounded-lg border border-solid border-transparent px-3 py-2 transition hover:bg-white hover:shadow-md [&:hover_*]:text-black [&:has(input:focus-visible)]:ring-2 [&:has(input:checked)]:bg-blue-700 [&:has(input:checked)]:text-white [&:has(input:not:checked)]:text-slate-500 ">
      <input
        type={isCheckbox ? "checkbox" : "radio"}
        className={`${
          !isCheckbox ? "hidden" : checked ? "opacity-100" : "opacity-0"
        } mr-2 mt-1 h-4 w-4 flex-shrink-0 cursor-pointer ${
          isCheckbox ? "rounded-md" : "rounded-full"
        } text-blue-600 ring-offset-1 focus-visible:ring-2 focus-visible:ring-blue-300`}
        checked={checked}
        onChange={onChange}
        id={name}
        name={name}
      />

      <DetailsComponent id={id} details={details} checked={checked} name={name}>
        <label htmlFor={name} className="w-full">
          <div className="flex cursor-pointer flex-col self-stretch">
            <h2 className="text-md font-bold">{name}</h2>
            <p className="mt-1 text-sm">{description}</p>
          </div>
        </label>
      </DetailsComponent>
    </li>
    // <DetailsComponent id={id} details={details} checked={checked} value={name}>
    //   <div className="flex cursor-pointer flex-col self-stretch">
    //     <h2 className="text-md font-bold">{name}</h2>
    //     <p className="mt-1 text-sm">{description}</p>
    //   </div>
    // </DetailsComponent>
  );
}
