conda deactivate && conda create --name machine_learning python=3.8 && ^
conda activate machine_learning && ^
pip install ../abcde-pip && ^
conda env update -n machine_learning --file machine_learning.yaml && ^
call abcde_env.bat