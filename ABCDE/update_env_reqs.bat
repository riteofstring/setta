conda deactivate && conda activate abcde_env && conda env export | grep -v "^prefix: " > abcde_env.yaml && ^
conda deactivate && conda activate machine_learning && conda env export | grep -v "^prefix: " > machine_learning.yaml && ^
call abcde_env.bat