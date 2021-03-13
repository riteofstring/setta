import asyncio
import getpass
import json
import pathlib
import ssl
from subprocess import PIPE, Popen

import requests
import websockets
from websockets.http import Headers

# ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)


async def hello(uri, token):
    header = Headers(authorization=f"Token {token}")
    async with websockets.connect(uri, extra_headers=header) as websocket:
        while True:
            ui_specs = await websocket.recv()
            json_as_string = activate_env_and_get_json(ui_specs)
            await websocket.send(json_as_string)


ADDRESS = "localhost:8000"
BACKEND = f"http://{ADDRESS}/"
WEBSOCKET_BACKEND = f"ws://{ADDRESS}/ws/cli/"


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

    token = r.json()["token"]

    asyncio.get_event_loop().run_until_complete(hello(WEBSOCKET_BACKEND, token))
    # asyncio.get_event_loop().run_forever()

    # stay_in_program = True
    # print("Listening to server...")
    # while stay_in_program:
    #     cmd = input("abcde> ")
    #     if cmd == "exit":
    #         stay_in_program = False


def activate_env_and_get_json(ui_specs):
    in_file = "temp_in.yaml"
    out_file = "temp_out.json"

    with open(in_file, "w") as text_file:
        text_file.write(json.loads(ui_specs))

    script_dir = pathlib.Path(__file__).parent.absolute()

    cmd = f"conda deactivate && activate abcde_env && python caller.py {in_file}"
    process = Popen(
        cmd.split(" "), stdout=PIPE, stderr=PIPE, cwd=script_dir, shell=True
    )
    process.communicate()

    with open(out_file, "r") as text_file:
        json_as_string = text_file.read()

    # cmd = f"rm {in_file} && rm {out_file}"
    # process = Popen(cmd.split(" "), stdout=PIPE, stderr=PIPE, cwd=script_dir, shell=True)
    # process.communicate()

    return json_as_string


if __name__ == "__main__":
    main()
