import _ from "lodash";
import { setCanvasColorChoices } from "state/actions/sections/setters";
import { useSectionInfos } from "state/definitions";

export function DrawAreaSettings({ sectionId }) {
  // const [value, setValue] = useState(url ?? "");
  // function onBlur(e) {
  //   const blurValue = e.target.value;
  //   if (blurValue) {
  //     setSectionInfoAttr({ sectionId, attr: "social", value: blurValue });
  //   }
  // }

  // return (
  //   <div className="mb-2 mt-2 w-full select-text">
  //     <div className="flex w-full items-center gap-3">
  //       <p className="select-none text-sm font-bold">Social Media URL</p>
  //       <input
  //         className=" w-full rounded-full bg-white px-4 py-1 text-sm ring-2 ring-setta-200 focus:ring-2 focus:ring-blue-500 dark:bg-setta-900"
  //         value={value}
  //         onChange={(e) => setValue(e.target.value)}
  //         onBlur={onBlur}
  //         placeholder="https://www.youtube.com/"
  //       />
  //     </div>
  //   </div>
  // );
  return <AvailableColors sectionId={sectionId} />;
}

const AvailableColors = ({ sectionId }) => {
  const colors = useSectionInfos(
    (x) => x.x[sectionId].canvasSettings?.colorChoices ?? [],
    _.isEqual,
  );

  const addColor = () => {
    setCanvasColorChoices(sectionId, [
      ...colors,
      { color: "#000000", description: "" },
    ]);
  };

  const removeColor = (removeIdx) => {
    setCanvasColorChoices(
      sectionId,
      colors.filter((color, idx) => idx !== removeIdx),
    );
  };

  const updateColor = (updateIdx, newColor) => {
    setCanvasColorChoices(
      sectionId,
      colors.map((color, idx) =>
        idx === updateIdx ? { ...color, color: newColor } : color,
      ),
    );
  };

  const updateDescription = (updateIdx, description) => {
    setCanvasColorChoices(
      sectionId,
      colors.map((color, idx) =>
        idx === updateIdx ? { ...color, description } : color,
      ),
    );
  };

  return (
    <>
      <button
        onClick={addColor}
        className="my-1 flex cursor-pointer items-center justify-between rounded-xl border border-solid border-setta-200/70 px-3 py-2 uppercase text-setta-500 hover:bg-setta-100 dark:border-setta-700 dark:text-setta-500 dark:hover:bg-setta-850"
        aria-label="Add color"
      >
        <p className="text-sm font-black ">Add Colors</p>
        <i className="gg-add !scale-90" />
      </button>

      <div className="flex flex-col gap-2 overflow-y-auto">
        {colors.map(({ color, description }, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <div className="flex flex-auto items-center gap-1 overflow-hidden">
              <input
                type="color"
                value={color}
                onChange={(e) => updateColor(idx, e.target.value)}
                className="min-h-8 min-w-8 cursor-pointer rounded-full p-0"
              />
              <input
                type="text"
                value={description}
                onChange={(e) => updateDescription(idx, e.target.value)}
                placeholder="Add description..."
                className="m-[2px] w-full truncate rounded border px-2 py-1 text-setta-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-setta-400 dark:placeholder-setta-700"
              />
            </div>
            <button
              onClick={() => removeColor(idx)}
              className="flex cursor-pointer items-center rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              aria-label="Remove color"
            >
              <i className="gg-close !scale-75" />
            </button>
          </div>
        ))}
      </div>
    </>
  );
};
