conda deactivate && conda activate abcde_env && conda env export | grep -v "^prefix: " > abcde_env.yaml && ^
call abcde_env.bat