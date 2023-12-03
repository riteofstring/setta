from runcoder.code.export_selected import export_selected
from runcoder.code.generate_code import generate_code
import json
from pprint import pprint

with open("python/runcoder/backend/seedData/exampleProjects/diffusionDrops.json", 'r') as f:
    x = json.load(f)


x["project"] = {"id": x.pop('id'), "name": x.pop('name'),  "owner": x.pop('owner'), "defaultConfigId": x.pop("defaultConfigId")}
x.update(x.pop("configs")[1])

with open("python/runcoder/backend/seedData/BaseUITypes.json", 'r') as f:
    baseu = json.load(f)

x["uiTypes"].update(baseu)

x = export_selected(x)
print(generate_code(x, push_var_name="p8"))

