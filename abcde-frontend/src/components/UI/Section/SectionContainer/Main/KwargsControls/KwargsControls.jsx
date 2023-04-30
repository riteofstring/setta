import { useActiveSection } from "models/activeSection";
import { useSectionParamFilter } from "models/info/sectionParamFilter";
import { useEffect, useRef } from "react";
import { AiOutlineMinus, AiOutlinePlus } from "react-icons/ai";
import { addKwarg, deleteKwarg } from "thunks/kwargs";
import { IconButton } from "utils/atoms/buttons/IconButton";
import { VerticalLine } from "utils/atoms/dividers/VerticalLine";
import { StandardSearch } from "utils/atoms/search/StandardSearch";

export function KwargsControls({ sectionId, objInfoId }) {
  const searchRef = useRef(null);
  const setParamFilter = useSectionParamFilter((x) => x.setFilter);
  useSearchShortcutKey({ sectionId, searchRef });

  function onClickAddKwarg() {
    addKwarg({ sectionId, objInfoId, incrementVersion: true });
  }
  function onClickDeleteKwarg() {
    deleteKwarg({ sectionId, objInfoId, deleteLast: true });
  }
  function onSearchChange(e) {
    setParamFilter({ sectionId, filter: e.target.value });
  }

  const inputStyles =
    "flex-1 text-xs outline-0 cursor-auto bg-transparent [border-width:0_0_1px_0] border-solid border-transparent focus-visible:border-blue-300 pl-7 py-1";

  return (
    <div className="border-b border-solid border-white bg-gradient-to-t from-slate-50 py-2 shadow-sm">
      <div className="flex items-center px-9">
        <p className="pr-1 font-heading text-xs font-bold uppercase tracking-widest text-slate-400">
          arguments
        </p>
        <IconButton
          icon={<AiOutlineMinus />}
          type="minus"
          onClick={onClickDeleteKwarg}
        />
        <IconButton
          icon={<AiOutlinePlus />}
          onClick={onClickAddKwarg}
          type="add"
        />
        <VerticalLine inputStyles="ml-2 mr-3 self-stretch" />
        <StandardSearch
          inputStyles={inputStyles}
          outerClasses="flex-1"
          onChange={onSearchChange}
          ref={searchRef}
        />
      </div>
    </div>
  );
}

function useSearchShortcutKey({ sectionId, searchRef }) {
  const isActive = useActiveSection((x) => x.id === sectionId);

  useEffect(() => {
    const handleShorcut = (event) => {
      if (isActive && event.ctrlKey && event.key === "k") {
        event.preventDefault();
        searchRef.current.focus();
      }
    };
    window.addEventListener("keydown", handleShorcut);

    return () => {
      window.removeEventListener("keydown", handleShorcut);
    };
  }, [isActive]);
}
