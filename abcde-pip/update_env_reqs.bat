conda deactivate && conda activate abcde_pip_env && conda env export | grep -v "^prefix: " > abcde_pip_env.yaml && ^
conda deactivate