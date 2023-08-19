import { Resizable } from "re-resizable";
import { ListContent } from "./ListContent";

export function TemplateListPane() {
  return (
    <Resizable
      defaultSize={{
        width: "350px",
        height: "100%",
      }}
      maxWidth="50%"
      minWidth="400px"
      className="flex flex-col overflow-y-auto overflow-x-hidden bg-slate-50 py-8 px-11 shadow-lg dark:bg-runcoder-900"
      enable={{
        top: false,
        right: true,
        bottom: false,
        left: false,
        topRight: false,
        bottomRight: false,
        bottomLeft: false,
        topLeft: false,
      }}
    >
      <ListContent />
    </Resizable>
  );
}
