export class UITypeProps {
  constructor(uiType, parentUITypeProps) {
    this.uiType = uiType;
    if (this.uiType === "LIST_NESTED_OBJECT") {
      this.isList = parentUITypeProps.isListRoot;
      this.isListRoot = !this.isList;
    } else {
      this.isList = false;
      this.isListRoot = false;
    }
  }
}
