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
  vCenter = false,
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
            vCenter={vCenter}
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
  vCenter,
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
  //  [&:has(input:checked)]:text-white
  return (
    <li
      className={`edit-list-item box-border flex select-none rounded-lg border-2 border-solid border-transparent px-3 py-2 transition hover:bg-white hover:shadow-md [&:hover_*]:text-black [&:has(input:focus-visible)]:ring-2 [&:has(input:checked)]:bg-blue-100 hover:[&:has(input:checked)]:bg-white [&:has(input:not:checked)]:text-slate-500 hover:[&>input:checked]:accent-slate-500 ${
        vCenter && "items-center"
      }`}
    >
      <input
        type={isCheckbox ? "checkbox" : "radio"}
        className={`${checked ? "bg-blue-700" : "ring-1 ring-slate-300"} ${
          !vCenter && "mt-1"
        } mr-3 h-4 w-4 flex-shrink-0 cursor-pointer ${
          isCheckbox ? "rounded-md" : "rounded-full"
        } ring-offset-1 focus-visible:ring-2 focus-visible:ring-blue-300`}
        checked={checked}
        onChange={onChange}
        id={name}
        name={name}
      />

      <DetailsComponent id={id} details={details} checked={checked} name={name}>
        <label htmlFor={name} className="w-full">
          <div className="flex cursor-pointer flex-col self-stretch">
            <h2 className="text-md font-bold">{name}</h2>
            {description && <p className="mt-1 text-sm">{description}</p>}
          </div>
        </label>
      </DetailsComponent>
    </li>
  );
}
