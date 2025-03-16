import { DropdownInput } from "components/Params/ParamUIs/DropdownInput";
import { PasswordInput } from "components/Params/ParamUIs/PasswordInput";
import { IconButton } from "components/Utils/atoms/buttons/IconButton";
import { Toggle } from "components/Utils/atoms/toggles/Toggle";
import { useState } from "react";

export function ProjectLLMSettings() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto pb-[30dvh] text-setta-600 dark:text-setta-400">
      <ModelItem />
      <ModelItem />
      <ModelItem />
      <button className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-solid border-setta-500/30 px-3 py-1.5 text-xs font-bold uppercase text-setta-700 hover:bg-white  focus-visible:border-blue-500 dark:text-setta-400 dark:hover:bg-setta-800">
        <i className="gg-play-list-add !scale-75" />
        <p>Add an LLM</p>
      </button>
    </div>
  );
}

function ModelItem() {
  const [isLocal, setIsLocal] = useState(false);

  return (
    <form className="mr-0.5 flex flex-col gap-2 rounded-lg  p-3 text-xs transition-colors hover:bg-white/50  hover:dark:bg-setta-800/50 ">
      <div className="flex items-center gap-2">
        <p className="-ml-2.5 w-full">
          <DropdownInput
            options={["GPT-4", "Claude 3.7", "Mixtral"]}
            onChange={() => {}}
            value={""}
            placeholder="Select an LLM model."
            small={false}
          />
        </p>
        <p>Local</p>
        <Toggle
          onClick={() => {
            setIsLocal(!isLocal);
          }}
        />
        <IconButton
          icon={<i className="gg-close !scale-75" />}
          color="text-setta-600 hover:text-white"
          bg="bg-transparent hover:bg-red-500"
          size="min-w-4 h-4"
          padding="p-1"
          twClasses=""
        />
      </div>

      {isLocal ? (
        <p className="flex flex-col gap-0.5">
          <label htmlFor="Model Location">Path</label>
          <input
            className="border-solid border-x-transparent border-b-setta-200/50 border-t-transparent bg-transparent placeholder-setta-200 focus-visible:!border-b-blue-400 dark:border-b-setta-600/30 dark:placeholder-setta-600"
            name="Model Location"
            placeholder="path"
          ></input>
        </p>
      ) : (
        <p className="flex flex-col gap-0.5">
          <label htmlFor="API Key">API Key</label>
          <div className="single-cell-container min-h-[19px]">
            <PasswordInput
              className={`nodrag single-cell-child peer/textinput flex w-full min-w-0 max-w-[calc(100%_-_1.1rem)] self-center justify-self-start font-mono text-xs text-[rgb(3,_47,_98);] dark:text-[rgb(165,_214,_255)]`}
              value={[]}
              onChange={[]}
              onEscape={[]}
              isDisabled={false}
              gridArea="single-cell-child"
            />
            <span
              className={`single-cell-child border-box self-end border-b border-setta-200/50 peer-focus-within/textinput:border-blue-400 dark:border-setta-600/30`}
            />
          </div>
        </p>
      )}
    </form>
  );
}
