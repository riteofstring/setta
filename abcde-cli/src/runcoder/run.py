import os
from pathlib import Path
from subprocess import PIPE, Popen

import click
from requests.exceptions import RetryError

from .constants import BACKEND, CODE_FOLDER
from .utils import _get_retry_session


def _try_getting_code(access_token, code_id):
    s = _get_retry_session()
    failed, r = True, None
    try:
        r = s.post(
            f"{BACKEND}codeGenerator/getCode",
            json={"codeId": code_id},
            cookies={"connect.sid": access_token},
        )
        failed = r.status_code != 200
        if r.status_code == 422:
            click.echo("Invalid code id")
        if r.status_code == 401:
            click.echo("Unauthorized")

    except RetryError:
        click.echo("Could not retrieve code")

    return failed, r


def _run(access_token, code_id):
    failed, r = _try_getting_code(access_token, code_id)

    if failed:
        return

    click.echo("Received code")
    code = r.json()["code"]

    cwd = os.getcwd()
    code_folder_path = Path(cwd) / CODE_FOLDER
    code_folder_path.mkdir(parents=True, exist_ok=True)

    code_file_path = code_folder_path / f"{code_id}.py"
    with open(code_file_path, "w") as f:
        f.write(code)

    cmd = f'python "{code_file_path}"'
    with Popen(cmd, stdout=PIPE, bufsize=1, universal_newlines=True) as p:
        for line in p.stdout:
            print(line, end="")  # process line here
