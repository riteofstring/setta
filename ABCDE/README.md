# ABCDE

Setting up environments for the first time:

1. ```.\setup_abcde_env.bat```
2. ```.\setup_machine_learning_env.bat```

Updating the environment requirements:
```.\update_env_reqs.bat```

The abcde_env is automatically activated after any of the above 3 batch files are run.

Activating the abcde_env:
```.\abcde_env.bat```


## PostgreSQL setup
Install PostgreSQL from here: https://www.enterprisedb.com/downloads/postgres-postgresql-downloads
No need to install Stack Builder.
Do not install pgadmin using the Postgres installer.
Install pgadmin separately from https://www.pgadmin.org/download/pgadmin-4-windows/

Next:
```pip install psycopg2```