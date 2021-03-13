import getpass
import pathlib
from subprocess import PIPE, Popen

import requests

BACKEND = "http://localhost:8000/"


def main():
    login_fail = True

    while login_fail:
        username = input("Username:")
        password = getpass.getpass("Password:")
        r = requests.post(
            f"{BACKEND}api/auth/login",
            data={"username": username, "password": password},
        )
        login_fail = r.status_code != 200
        if login_fail:
            print("Incorrect username/password combination\n")

    stay_in_program = True
    print("Listening to server...")
    while stay_in_program:
        cmd = input("abcde> ")
        if cmd == "exit":
            stay_in_program = False


# script_dir = pathlib.Path(__file__).parent.absolute()

# cmd = r"cp 'D:\Documents\App Development\abcde-pip\tests\exporting_specs\simple_train_test.yaml' temp_in.yaml"
# process = Popen(cmd.split(" "), stdout=PIPE, stderr=PIPE, cwd=script_dir, shell=True)
# process.communicate()

# cmd = "conda deactivate && activate abcde_env && python caller.py temp_in.yaml"
# process = Popen(cmd.split(" "), stdout=PIPE, stderr=PIPE, cwd=script_dir, shell=True)
# process.communicate()

# cmd = "rm temp_in.yaml && rm temp_out.json"
# process = Popen(cmd.split(" "), stdout=PIPE, stderr=PIPE, cwd=script_dir, shell=True)
# process.communicate()


if __name__ == "__main__":
    main()
