import importlib
import os
import sys
from pathlib import Path

import click
from requests.exceptions import RetryError

from runcoder.cli.logger import Runcoder
from runcoder.cli.request_utils import get_retry_session, post
from runcoder.utils.constants import CODE_FOLDER


def try_getting_code(code_id):
    s = get_retry_session()
    failed, r = True, None
    try:
        r = post(
            s,
            "codeGenerator/getCode",
            json={"codeId": code_id},
        )
        failed = r.status_code != 200
        if r.status_code == 422:
            click.echo("Invalid code id")
        if r.status_code == 401:
            click.echo("Unauthorized")

    except RetryError:
        click.echo("Could not retrieve code")

    return failed, r


def run(code_id):
    failed, r = try_getting_code(code_id)

    if failed:
        return

    click.echo("Received code")
    data = r.json()
    code = data["code"]
    toLocation = data["toLocation"]

    cwd = os.getcwd()
    code_folder_path = Path(cwd) / CODE_FOLDER
    code_folder_path.mkdir(parents=True, exist_ok=True)

    code_file_path = code_folder_path / f"{code_id}.py"
    with open(code_file_path, "w") as f:
        f.write(code)

    Runcoder.toLocation = toLocation
    Runcoder.run_id = code_id

    # add current working directory to path
    sys.path.insert(0, cwd)
    # importing the code executes it
    # because all the code is at the top level
    importlib.import_module(f".{code_id}", f"{CODE_FOLDER}")

    #### Alternate approach: launch subprocess ####
    # cmd = ["python", code_file_path]
    # subprocess.call(cmd, stdout=sys.stdout, stderr=sys.stderr)
