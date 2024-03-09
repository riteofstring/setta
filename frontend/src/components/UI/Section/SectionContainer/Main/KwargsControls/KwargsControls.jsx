import { useSectionParamFilter } from "models/info/sectionParamFilter";
import { addKwarg, deleteKwarg } from "thunks/kwargs";

export function KwargsControls({ sectionId, objInfoId }) {
  const setParamFilter = useSectionParamFilter((x) => x.setFilter);

  function onClickAddKwarg() {
    addKwarg({ sectionId, objInfoId, incrementVersion: true });
  }
  function onClickDeleteKwarg() {
    deleteKwarg({
      sectionId,
      objInfoId,
      deleteLast: true,
      incrementVersion: true,
    });
  }
  function onSearchChange(e) {
    setParamFilter({ sectionId, filter: e.target.value });
  }

  const inputStyles =
    "flex-1 min-w-0 text-xs outline-0 cursor-auto truncate bg-transparent [border-width:0_0_1px_0] border-solid border-transparent focus-visible:border-blue-300 pl-7 py-1";

  const buttonClass =
    "focus-visible:ring-2 inline-flex items-center nodrag cursor-pointer flex justify-center bg-transparent hover:bg-runcoder-100 dark:hover:bg-runcoder-600 text-runcoder-500 rounded-full py-1 px-1 w-3 h-3";

  // bg-gradient-to-t from-runcoder-50
  return (
    <>
      <section className="card-args-control flex min-w-0 items-center rounded-xl border-b border-solid border-white  px-6 pb-1 shadow-sm @container dark:border-runcoder-700 dark:from-transparent">
        <h3 className="pr-1  font-heading text-xs font-bold uppercase text-runcoder-600/70 before:content-['args'] @[16rem]:tracking-widest @[16rem]:before:content-['arguments'] dark:text-runcoder-400/70 "></h3>
        <button className={buttonClass} onClick={onClickDeleteKwarg}>
          <i className="gg-math-minus" />
        </button>
        <button className={buttonClass} onClick={onClickAddKwarg}>
          <i className="gg-math-plus" />
        </button>
        {/* <IconButton
          icon={<AiOutlineMinus />}
          type="minus"
          onClick={onClickDeleteKwarg}
        />
        <IconButton
          icon={<AiOutlinePlus />}
          onClick={onClickAddKwarg}
          type="add"
          aria-label="Add Kwarg"
        /> */}
        {/* <VerticalLine inputStyles="ml-2 mr-3 self-stretch" /> */}
        {/* <input
          id={`${sectionId}-args-filter`} // IMPORTANT, used for ctrl-k shortcut
          className={inputStyles}
          placeholder="Filter"
          tabIndex="0"
          onChange={onSearchChange}
        /> */}
        {/* <StandardSearch
          id={`${sectionId}-args-filter`} // IMPORTANT, used for ctrl-k shortcut
          leftElement={<BiFilter className="text-runcoder-400" />}
          placeholder="Filter"
          inputStyles={inputStyles}
          outerClasses="flex-1"
          onChange={onSearchChange}
        /> */}
      </section>
      {/* <hr className="col-span-full row-start-5 row-end-6 " /> */}
    </>
  );
}
