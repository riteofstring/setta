import asyncio
import getpass
import json
import os
import pathlib
import ssl
from subprocess import PIPE, Popen

import requests
import websockets
from websockets.http import Headers

# ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)


async def hello(uri, token):
    query_string = f"?token={token}&source=cli"
    uri = f"{uri}{query_string}"
    async with websockets.connect(uri) as websocket:
        print("connected to websocket")
        while True:
            ui_specs = await websocket.recv()
            ui_specs = json.loads(ui_specs)
            print("received")
            if "enteredText" in ui_specs:
                return_val = activate_env_and_get_json(ui_specs)
                await websocket.send(return_val)
                print("sent")
            elif "code" in ui_specs:
                print("running code")
                run_code(ui_specs)
                print("done!")


ADDRESS = "localhost:8000"
BACKEND = f"http://{ADDRESS}/"
WEBSOCKET_BACKEND = f"ws://{ADDRESS}/ws/cli/"


def try_login():
    username = input("Username:")
    password = getpass.getpass("Password:")
    r = requests.post(
        f"{BACKEND}api/auth/login",
        data={"username": username, "password": password},
    )
    login_fail = r.status_code != 200
    if login_fail:
        print("Incorrect username/password combination\n")
    else:
        print("Login success")
    return login_fail, r


def get_websocket_token(token):
    r = requests.post(
        f"{BACKEND}api/auth/websocketAuth", headers={"Authorization": f"Token {token}"}
    )
    success = r.status_code == 200
    return success, r


def main():
    login_fail = True

    while login_fail:
        login_fail, returned_data = try_login()

    token = returned_data.json()["token"]
    success, returned_data = get_websocket_token(token)
    if success:
        websocket_token = returned_data.json()["token"]
        asyncio.get_event_loop().run_until_complete(
            hello(WEBSOCKET_BACKEND, websocket_token)
        )


def activate_env_and_get_json(ui_specs):
    in_file = "temp_in.yaml"
    out_file = "temp_out.json"

    with open(in_file, "w") as text_file:
        text_file.write(ui_specs["enteredText"])

    script_dir = pathlib.Path(__file__).parent.absolute()

    cmd = f"conda deactivate && activate machine_learning && python caller.py {in_file}"
    process = Popen(
        cmd.split(" "), stdout=PIPE, stderr=PIPE, cwd=script_dir, shell=True
    )
    process.communicate()

    with open(out_file, "r") as text_file:
        json_as_string = text_file.read()

    cmd = f"rm {in_file} && rm {out_file}"
    process = Popen(
        cmd.split(" "), stdout=PIPE, stderr=PIPE, cwd=script_dir, shell=True
    )
    process.communicate()

    return json.dumps({"enteredText": json_as_string})


def run_code(ui_specs):
    directory = "D:\\Downloads"
    in_file = os.path.join(directory, "temp_code.py")

    with open(in_file, "w") as text_file:
        text_file.write(ui_specs["code"])

    cmd = f"conda deactivate && activate machine_learning && python {in_file}"
    process = Popen(cmd.split(" "), stdout=PIPE, stderr=PIPE, cwd=directory, shell=True)
    stdout, stderr = process.communicate()
    print("stdout", stdout.decode())
    print("\n\n\nstderr", stderr.decode())

    cmd = f"rm {in_file}"
    process = Popen(cmd.split(" "), stdout=PIPE, stderr=PIPE, cwd=directory, shell=True)
    process.communicate()

    # script_file = "temp_script.bat"
    # with open(script_file, "w") as text_file:
    #     text_file.write(f"deactivate && activate machine_learning && python {in_file}")

    # os.system(f"start cmd /K {script_file}")
    # cmd = f"rm {in_file} && rm {script_file} && rm -rf MNIST"
    # process = Popen(
    #     cmd.split(" "), stdout=PIPE, stderr=PIPE, shell=True
    # )
    # process.communicate()


if __name__ == "__main__":
    main()
