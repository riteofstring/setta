# abcde-test


### To create new data
On the frontend, paste this code into `thunks/save.getProjectData()`:

```javascript
  console.log(output);
  console.log(
    _.pick(useCodeInfo.getState(), [
      "allCodeInfo",
      "allCollections",
      "callables",
      "params",
      "paramCollections",
    ])
  );
```

Save the project, then copy the project JSON object into `abcde-test/src/NewProject.json` and the code info into `abcde-test/src/NewCodeInfo.json`.

Then run `node ./src/saveNewProject.js`. The new data will be in `src/newProjectPlaceholder`.