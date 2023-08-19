import { SiteLogo } from "components/AppContainer/Header/SiteLogo";

export function StandAloneInputContainer({
  onSubmit,
  logo = true,
  title,
  children,
  footer,
}) {
  return (
    <div className="flex rounded-2xl border border-solid border-white bg-white px-14 py-12 shadow-2xl dark:border-runcoder-900 dark:bg-runcoder-900">
      <form className="grid w-[400px] gap-8" onSubmit={onSubmit}>
        <div className="grid place-items-center">
          {logo && <SiteLogo />}
          <h1 className="mt-2 select-none font-heading text-3xl font-bold text-slate-600 dark:text-runcoder-200">
            {title}
          </h1>
        </div>
        {children}
        <div className="flex flex-col gap-2">{footer}</div>
      </form>
    </div>
  );
}
