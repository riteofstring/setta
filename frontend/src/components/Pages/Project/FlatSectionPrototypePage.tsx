import { FlatSectionPrototypeGallery } from "components/Section/Layouts/FlatSectionPrototype";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { HOME_ROUTER_PATH } from "utils/constants";

export function FlatSectionPrototypePage() {
  useEffect(() => {
    document.title = "Flat Section Prototype";
  }, []);

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-[#eef1f5] text-neutral-900 dark:bg-[#111111] dark:text-setta-50">
      <header className="border-b border-neutral-300 px-5 py-4 dark:border-setta-800">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to={HOME_ROUTER_PATH}
            className="text-[11px] uppercase tracking-[0.18em] text-neutral-500 dark:text-setta-400"
          >
            Home
          </Link>
          <span className="text-[11px] uppercase tracking-[0.18em] text-neutral-400 dark:text-setta-500">
            Internal Preview
          </span>
        </div>
        <h1 className="mt-3 font-mono text-[16px] leading-6">
          Flat Dict / Callable Prototype
        </h1>
        <p className="mt-2 max-w-[62ch] text-[12px] leading-5 text-neutral-600 dark:text-setta-300">
          Static shell study for the simplified dict and callable rewrite. This
          page is intentionally behavior-free so the layout can be judged on its
          own.
        </p>
      </header>

      <section className="w-full p-5">
        <article className="min-w-0">
          <FlatSectionPrototypeGallery />
        </article>
      </section>
    </main>
  );
}
