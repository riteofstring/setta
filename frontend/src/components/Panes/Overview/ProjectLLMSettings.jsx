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
    <form className="mr-0.5 flex flex-col gap-4 rounded-md border border-setta-100/50 p-3 text-xs transition-colors hover:bg-white/50 dark:border-setta-850/50 hover:dark:bg-setta-950/30">
      <p className="flex flex-col gap-2">
        <label htmlFor="Model Name">Model Name</label>
        <input
          className="!border-b border-setta-300 dark:border-white"
          name="Model Name"
          placeholder="Claude 3.5"
        ></input>
      </p>
      <p className="flex flex-col gap-2">
        <label htmlFor="Model Location">Localtion</label>
        <input name="Model Location" placeholder="path"></input>
      </p>
      <p className="flex flex-col gap-2">
        <label htmlFor="API Key">API Key</label>
        <input name="API Key" placeholder="sk-"></input>
      </p>
    </form>
  );
}
