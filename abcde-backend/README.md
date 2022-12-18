## PostgreSQL setup

- Install PostgreSQL from here: https://www.enterprisedb.com/downloads/postgres-postgresql-downloads
- No need to install Stack Builder or pgadmin using the Postgres installer.
- Set password to 123

### Add postgres to path
Add `%PROGRAMFILES%\PostgreSQL\14\bin` to the PATH environment variable.

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
./db/blankSlate.bat
```

### Start server
```bash
./start.bat
```

### Kill postgres
```bash
./db/kill.bat
```

### Open psql and view the database
```bash
./db/login.bat
```

### Just seed the database

Seed all the tables
```bash
./db/seed.bat
```




### References

- https://docs.nestjs.com/
- https://github.com/prisma/prisma/discussions/7200
