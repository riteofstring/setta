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
      } nodrag cursor-pointer flex justify-center bg-transparent hover:bg-blue-500 justify-content-center mr-1 text-setta-600 hover:text-white rounded-full p-0 w-4 h-4 ${twClasses ?? ""}`}
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
