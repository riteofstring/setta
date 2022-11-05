rm -rf prisma/migrations
call db/reset.bat --skip-seed
call db/migrate.bat init
call db/seed.bat