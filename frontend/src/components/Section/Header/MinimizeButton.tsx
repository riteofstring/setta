import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImpl,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { route_toggle_minimized } from "utils/generatedEndpoints";

export function MinimizeButton({ sectionId, ...props }) {
  const { twClasses, grid, ...buttonProps } = props;

  const isMinimized = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImpl(x, sectionId);
    return impl.isMinimized;
  });
  function onClick() {
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        const impl = getCurrEffectiveSectionImpl(state, sectionId);
        setCurrEffectiveSectionImplValue(state, sectionId, {
          isMinimized: !impl.isMinimized,
        });
      },
      send: (frontendOpId) =>
        route_toggle_minimized({
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
          frontendOpId,
        }),
    });
  }

  return (
    <button
      className={`focus-visible:ring-2 ${
        grid ? "grid place-items-center" : "inline-flex items-center"
      } nodrag justify-content-center mr-1 flex h-4 w-4 cursor-pointer justify-center rounded-full bg-transparent p-0 text-setta-600 hover:bg-blue-500 hover:text-white ${twClasses ?? ""}`}
      onClick={onClick}
      {...buttonProps}
    >
      {!isMinimized ? (
        <i className="gg-math-minus" />
      ) : (
        <i className="gg-maximize !scale-[.4]" />
      )}
    </button>
  );
}
