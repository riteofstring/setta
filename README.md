# runcoder

Dev setup:

```
. ./dev_install.sh
```


To test pip package installation:
```
. ./test_install.sh
```


Format and lint python:

```
./format_code.sh && ./run_linter.sh
```


Start frontend and backend in dev mode:
```
cd frontend
npm run start
```

There is reload mode where the backend reloads on file changes, but it's broken.