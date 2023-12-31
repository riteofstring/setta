import { useSectionParamFilter } from "models/info/sectionParamFilter";
import { AiOutlineMinus, AiOutlinePlus } from "react-icons/ai";
import { BiFilter } from "react-icons/bi";
import { addKwarg, deleteKwarg } from "thunks/kwargs";
import { IconButton } from "utils/atoms/buttons/IconButton";
import { VerticalLine } from "utils/atoms/dividers/VerticalLine";
import { StandardSearch } from "utils/atoms/search/StandardSearch";

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
    "flex-1 text-xs outline-0 cursor-auto bg-transparent [border-width:0_0_1px_0] border-solid border-transparent focus-visible:border-blue-300 pl-7 py-1";

  return (
    <>
      <section className="card-args-control flex items-center rounded-xl border-b border-solid  border-white bg-gradient-to-t from-slate-50 px-6 pb-1 shadow-sm dark:border-runcoder-700 dark:from-transparent">
        <h3 className="pr-1 font-heading text-xs font-bold uppercase tracking-widest text-runcoder-600/70 dark:text-runcoder-400/70 ">
          arguments
        </h3>
        <IconButton
          icon={<AiOutlineMinus />}
          type="minus"
          onClick={onClickDeleteKwarg}
        />
        <IconButton
          icon={<AiOutlinePlus />}
          onClick={onClickAddKwarg}
          type="add"
          aria-label="Add Kwarg"
        />
        <VerticalLine inputStyles="ml-2 mr-3 self-stretch" />
        <StandardSearch
          id={`${sectionId}-args-filter`} // IMPORTANT, used for ctrl-k shortcut
          leftElement={<BiFilter className="text-runcoder-400" />}
          placeholder="Filter"
          inputStyles={inputStyles}
          outerClasses="flex-1"
          onChange={onSearchChange}
        />
      </section>
      {/* <hr className="col-span-full row-start-5 row-end-6 " /> */}
    </>
  );
}
