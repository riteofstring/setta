import { PasswordInput } from "components/Params/ParamUIs/PasswordInput";

export function ProjectLLMSettings() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto text-setta-600 dark:text-setta-400">
      <ModelItem />
      <ModelItem />
      <ModelItem />
      <ModelItem />
      <ModelItem />
      <ModelItem />
      <ModelItem />
      <ModelItem />
    </div>
  );
}

function ModelItem() {
  return (
    <form className="mr-0.5 flex flex-col gap-4 rounded-md border border-setta-100/50 p-3 text-xs transition-colors hover:bg-white/50 dark:border-setta-850/50 hover:dark:bg-setta-950/30 ">
      <p className="flex flex-col gap-2">
        <label htmlFor="Model Name">Model Name</label>
        <input
          className="border-solid border-x-transparent border-b-setta-200/50 border-t-transparent bg-transparent placeholder-setta-200 focus-visible:!border-b-blue-400 dark:border-b-setta-600/30 dark:placeholder-setta-600"
          name="Model Name"
          placeholder="Claude 3.5"
        ></input>
      </p>
      <p className="flex flex-col gap-2">
        <label htmlFor="Model Location">Localtion</label>
        <input
          className="border-solid border-x-transparent border-b-setta-200/50 border-t-transparent bg-transparent placeholder-setta-200 focus-visible:!border-b-blue-400 dark:border-b-setta-600/30 dark:placeholder-setta-600"
          name="Model Location"
          placeholder="path"
        ></input>
      </p>
      <p className="flex flex-col gap-2">
        <label htmlFor="API Key">API Key</label>
        <div className="single-cell-container">
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

        {/* <input
          className="border-solid border-x-transparent border-b-setta-200/50 border-t-transparent bg-transparent placeholder-setta-200 focus-visible:!border-b-blue-400 dark:border-b-setta-600/30 dark:placeholder-setta-600"
          name="API Key"
          placeholder="sk-"
        ></input> */}
      </p>
    </form>
  );
}
