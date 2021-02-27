class ParameterInfoExport {
    constructor(name, selected = null) {
        this.name = name
        this.selected = selected
    }
}

class ObjInfoExport {
    constructor(name, selected = null) {
        this.name = name
        this.selected = selected
    }
}

class ModuleInfoExport {
    constructor(name, selected = null) {
        this.name = name
        this.selected = selected
    }
}

class SectionExport {
    constructor(name, selected = null) {
        this.name = name
        this.selected = selected
    }
}


sectionNames = ["Model", "Optimizer", "Dataset", "Transform"]
selected = {}
for (let key of sectionNames){
    selected[key] = new SectionExport(key)
}

module = new ModuleInfoExport("torchvision.models")
model = new ObjInfoExport("resnet101")
model.selected = {"pretrained": new ParameterInfoExport("pretrained", true),
                            "download": new ParameterInfoExport("download", true)}
module.selected = {"resnet101": model}
selected["Model"].selected = {"torchvision.models": module}


module = new ModuleInfoExport("torchvision.transforms")
transform = new ObjInfoExport("Compose")
transform.selected = {"transforms": new ModuleInfoExport("torchvision.transforms")}
transform.selected["transforms"].selected = new ObjInfoExport("Normalize")
module.selected = {"Compose": transform}
selected["Transform"].selected = {"torchvision.transforms": module}

console.log("selected", selected)