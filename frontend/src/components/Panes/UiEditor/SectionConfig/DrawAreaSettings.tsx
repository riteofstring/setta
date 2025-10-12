import { AvailableColors } from "components/Params/ParamUIs/ColorPickerInput";
import _ from "lodash";
import { useProjectState } from "state/definitions";

export function DrawAreaSettings({ sectionId }) {
  return <>{/* <DrawAreaAvailableColors sectionId={sectionId} /> */}</>;
}

function DrawAreaAvailableColors({ sectionId }) {
  const colors = useProjectState(
    (x) => x.sections[sectionId].canvasSettings?.colorChoices ?? [],
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
    <AvailableColors
      colors={colors}
      addColor={addColor}
      removeColor={removeColor}
      updateColor={updateColor}
      updateDescription={updateDescription}
    />
  );
}

function setCanvasColorChoices(sectionId, value) {
  useProjectState.setState((x) => {
    const s = x.sections[sectionId];
    s.canvasSettings.colorChoices = value;
  });
}
