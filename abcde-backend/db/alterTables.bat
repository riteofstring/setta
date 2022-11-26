SET PGPASSWORD=123&&psql -d abcde -U postgres ^
-c "ALTER TABLE ""public"".""CodeInfoTypeMap"" add constraint only_one_null check (num_nonnulls(""ownerId"",""projectConfigId"") = 1);" ^
-c "ALTER TABLE ""public"".""CodeInfoMap"" add constraint  only_one_null check (num_nonnulls(""ownerId"",""projectConfigId"") = 1);"