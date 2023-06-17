@REM SET PGPASSWORD=123&&psql -d abcde -U postgres ^
@REM -c "ALTER TABLE ""public"".""CodeInfoTypeMap"" add constraint CodeInfoTypeMap_only_one_null check (num_nonnulls(""ownerId"",""projectConfigId"") = 1);" ^
@REM -c "ALTER TABLE ""public"".""CodeInfoMap"" add constraint  CodeInfoMap_only_one_null check (num_nonnulls(""ownerId"",""projectConfigId"") = 1);" ^
@REM -c "CREATE UNIQUE INDEX CodeInfoTypeMap_unique_index on ""public"".""CodeInfoTypeMap"" (""type"",""ownerId"",""projectConfigId"") NULLS NOT DISTINCT;"