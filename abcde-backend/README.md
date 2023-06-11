# PostgreSQL setup

- Install PostgreSQL from here: https://www.enterprisedb.com/downloads/postgres-postgresql-downloads
- No need to install Stack Builder or pgadmin using the Postgres installer.
- Set password to 123

## Add postgres to path

### Windows:
Add `%PROGRAMFILES%\PostgreSQL\15\bin` to the PATH environment variable.

### Mac:
Add this to the .zshrc file:
`export PATH=/Library/PostgreSQL/15/bin:$PATH`

The following command should now work:

```bash
psql -U postgres
# enter the password that you entered during installation
```

### Link abcde-utils and abcde-test
```
yarn linkutils && yarn linktest
```

### Create db, create tables, add data
```bash
./db/blankSlate.sh
```

### Open psql and view the database
```bash
./db/login.sh
```

### Just seed the database

Seed all the tables
```bash
./db/seed.sh
```

### Run tests

Unit tests:
```
yarn unittest
```

Specific unit tests
```
yarn unittest db/user/createUser
```

First reset test db
```
yarn unittest "" --reset
```

Big tests:
```
yarn bigtest
```

All tests:
```
yarn test
```


### References

- https://github.com/prisma/prisma/discussions/7200
