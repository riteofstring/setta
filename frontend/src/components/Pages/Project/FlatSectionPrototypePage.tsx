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
      <h1 className="sr-only">Flat section prototype</h1>
      <nav aria-label="Prototype navigation" className="px-2 pt-4 sm:px-5">
        <Link
          to={HOME_ROUTER_PATH}
          className="text-[10px] uppercase tracking-[0.16em] text-neutral-400 hover:text-neutral-700 dark:text-setta-600 dark:hover:text-setta-300"
        >
          Home
        </Link>
      </nav>

      <section className="w-full p-2 sm:p-5">
        <article className="min-w-0">
          <FlatSectionPrototypeGallery />
        </article>
      </section>
    </main>
  );
}
