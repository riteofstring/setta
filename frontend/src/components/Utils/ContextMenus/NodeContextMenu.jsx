import { Item } from "components/Utils/atoms/dropdown/item";
import _ from "lodash";
import { closeAllContextMenus } from "state/actions/contextMenus";
import { useContextMenus } from "state/definitions";
import { ContextMenuCore } from "./ContextMenuCore";

export function DrawAreaContextMenu() {
  const { isOpen, x, y, img, canvas } = useContextMenus(
    (x) => x.draw,
    _.isEqual,
  );
  console.log("isOpen", isOpen);
  function onClickSaveImage() {
    const dataURL = saveImageWithCanvas(img, canvas);

    // Now you can use the dataURL to trigger a download or send it to a server
    // For example, to trigger a download:
    const link = document.createElement("a");
    link.href = dataURL;
    link.download = "combined_image.png";
    link.click();
  }

  return (
    <ContextMenuCore
      x={x}
      y={y}
      closeContextMenu={closeAllContextMenus}
      isOpen={isOpen}
    >
      <Item onClick={onClickSaveImage}>Save Image</Item>
    </ContextMenuCore>
  );
}

function saveImageWithCanvas(img, canvas) {
  // Create a new canvas
  const newCanvas = document.createElement("canvas");
  newCanvas.width = img.width;
  newCanvas.height = img.height;

  // Get the context of the new canvas
  const ctx = newCanvas.getContext("2d");

  // Draw the original image onto the new canvas
  ctx.drawImage(img, 0, 0);

  // Draw the existing canvas content onto the new canvas
  ctx.drawImage(canvas, 0, 0);

  // Convert the new canvas to a data URL
  return newCanvas.toDataURL("image/png");
}
