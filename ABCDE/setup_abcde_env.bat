conda deactivate && conda create --name abcde_env python=3.8 && ^
conda activate abcde_env && ^
pip install ../abcde-pip && ^
conda env update -n abcde_env --file abcde_env.yaml && ^
call abcde_env.bat