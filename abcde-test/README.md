# abcde-test

### To create new data

On the frontend, paste this code into `thunks/save.getProjectData()`:

```javascript
console.log(output);
console.log(_.pick(useCodeInfo.getState(), ["allCodeInfo"]));
```

Save the project, then copy the project JSON object into `abcde-test/src/NewProject.json` and the code info into `abcde-test/src/NewCodeInfo.json`.

Then run `node ./src/saveNewProject.js`. The new data will be in `src/newProjectPlaceholder`.

### To make long text json-compatible

Use `makeTextJsonCompatible` and pass in the input and output text file paths.

```
python src\makeTextJsonCompatible.py --path D:\Downloads\sample_readme.txt --out_path D:\Downloads\sample_readme2.txt
```
