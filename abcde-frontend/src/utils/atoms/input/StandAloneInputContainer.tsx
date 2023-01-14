import { SiteLogo } from "components/AppContainer/Header/SiteLogo";

export function StandAloneInputContainer({
  onSubmit,
  logo = true,
  title,
  children,
  footer,
}) {
  return (
    <div className="flex px-14 py-12 rounded-2xl border border-solid border-white shadow-2xl bg-white">
      <form className="grid gap-8 w-[400px]" onSubmit={onSubmit}>
        <div className="grid place-items-center">
          {logo && <SiteLogo />}
          <h1 className="font-heading text-gray-600 text-3xl font-bold select-none">
            {title}
          </h1>
        </div>
        {children}
        <div className="flex flex-col gap-2">{footer}</div>
      </form>
    </div>
  );
}
