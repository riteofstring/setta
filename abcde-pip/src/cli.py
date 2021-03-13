import pathlib
from subprocess import PIPE, Popen

script_dir = pathlib.Path(__file__).parent.absolute()

cmd = r"cp 'D:\Documents\App Development\abcde-pip\tests\exporting_specs\simple_train_test.yaml' temp_in.yaml"
process = Popen(cmd.split(" "), stdout=PIPE, stderr=PIPE, cwd=script_dir, shell=True)
process.communicate()

cmd = "conda deactivate && activate abcde_env && python caller.py temp_in.yaml"
process = Popen(cmd.split(" "), stdout=PIPE, stderr=PIPE, cwd=script_dir, shell=True)
process.communicate()

cmd = "rm temp_in.yaml && rm temp_out.json"
process = Popen(cmd.split(" "), stdout=PIPE, stderr=PIPE, cwd=script_dir, shell=True)
process.communicate()
