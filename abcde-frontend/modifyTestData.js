const Packages = require("./src/__tests__data/simpleTrainTest/Packages.json");
const ObjCollections = require("./src/__tests__data/simpleTrainTest/ObjCollections.json");
const ParamCollections = require("./src/__tests__data/simpleTrainTest/ParamCollections.json");
const fs = require("fs");

const newJson = {};

for (let p of Object.values(Packages.children)) {
  newJson[p.id] = {
    id: p.id,
    name: p.name,
    version: p.version,
    type: "module",
    children: [],
  };
  for (let module of Object.values(p.children)) {
    newJson[p.id].children.push(module.id);
    newJson[module.id] = {
      id: module.id,
      name: module.name,
      type: "module",
      rel: "attribute",
      parentId: p.id,
      children: [],
    };
    for (let obj of Object.values(module.children)) {
      newJson[module.id].children.push(obj.id);
      newJson[obj.id] = {
        id: obj.id,
        name: obj.name,
        type: "callable",
        rel: "attribute",
        parentId: module.id,
        children: [],
      };
      for (let param of Object.values(obj.children)) {
        newJson[obj.id].children.push(param.id);
        newJson[param.id] = {
          id: param.id,
          name: param.name,
          defaultVal: param.defaultVal,
          type: param.type,
          rel: "parameter",
          parentId: obj.id,
          children: [],
        };
      }
    }
  }
}

for (let collection of Object.values(ObjCollections.children)) {
  newJson[collection.id] = {
    id: collection.id,
    name: collection.name,
    type: "collection",
    description: collection.description,
    children: collection.children,
    requiresSearch: true,
  };
}

for (let collection of Object.values(ParamCollections.children)) {
  newJson[collection.id] = {
    id: collection.id,
    name: collection.name,
    type: "collection",
    description: collection.description,
    children: [],
    requiresSearch: false,
  };
  for (let param of Object.values(collection.children)) {
    newJson[collection.id].children.push(param.id);
    newJson[param.id] = {
      id: param.id,
      name: param.name,
      defaultVal: param.defaultVal,
      type: param.type,
      rel: "parameter",
      parentId: collection.id,
      children: [],
    };
  }
}

fs.writeFileSync(
  "./src/__tests__data/simpleTrainTest/NewPackages.json",
  JSON.stringify(newJson, null, 4)
);

// CodeInfo
// this.children contains all parameters (for functions) and attributes
// this.type is the datatype like float, string, callable, class, function etc.
// this.rel is the relationship it has with its parent. For example, "attribute" or "parameter"
// Example:
// def fn(a: Callable, b: float)
// The children of fn are [a, b]
// a.type = Callable
// a.rel = "parameter"
// b.type = float
// b.rel = "parameter"
