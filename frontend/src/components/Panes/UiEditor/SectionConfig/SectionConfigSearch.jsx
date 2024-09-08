import { StandardSearch } from "components/Utils/atoms/search/StandardSearch";
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
    <div className="flex h-full min-h-0 flex-grow flex-col overflow-y-hidden [&>form]:flex-grow-0">
      <Search onSubmit={onSearch} />
      <div className="mt-4 overflow-y-scroll">
        <ul className="flex flex-grow flex-col gap-4">
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
    </div>
  );
}

function Search({ onSubmit }) {
  function onFormSubmit(e) {
    e.preventDefault();
    onSubmit(e.target[0].value);
  }

  const inputStyles =
    "flex-grow min-w-0 w-full text-sm outline-0 cursor-auto bg-transparent [border-width:0_0_1px_0] border-solid border-setta-300 dark:border-setta-800  focus-visible:!border-blue-300 pl-7 py-1 truncate";

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
    const checked = e.target.checked;
    onSelectionChange({
      id,
      checked,
      newValueFn: isCheckbox
        ? checkboxChangeFn(checked, id)
        : radioChangeFn(checked, id),
    });
  }

  // deal with tabbing
  //  [&:has(input:checked)]:text-white
  return (
    <li
      className={`edit-list-item box-border flex select-none rounded-lg border-2 border-solid border-transparent px-3 py-2 transition hover:bg-white hover:shadow-md dark:hover:bg-setta-700 [&:has(input:checked)]:bg-blue-100 hover:[&:has(input:checked)]:bg-white dark:[&:has(input:checked)]:bg-blue-900 dark:hover:[&:has(input:checked)]:bg-setta-800 [&:has(input:focus-visible)]:ring-2 [&:has(input:not:checked)]:text-setta-500 dark:[&:has(input:not:checked)]:text-setta-300 [&:hover_*]:text-black dark:[&:hover_*]:text-setta-100 hover:[&>input:checked]:accent-setta-500 ${
        vCenter && "items-center"
      }`}
    >
      <input
        type={isCheckbox ? "checkbox" : "radio"}
        className={`${checked ? "bg-blue-900" : "ring-1 ring-setta-300"} ${
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
        <div className="w-full">
          <div className="flex cursor-pointer flex-col self-stretch">
            <p className="text-md font-semibold text-setta-800 dark:text-setta-100">
              {name}
            </p>
            {description && (
              <p className="mt-1 text-sm dark:text-setta-200">{description}</p>
            )}
          </div>
        </div>
      </DetailsComponent>
    </li>
  );
}
