import os
import subprocess
import tempfile


def startMyPyDaemon():
    subprocess.run(
        [
            "dmypy",
            "start",
            "--",
            "--show-error-end",
            "--no-error-summary",
            "--no-pretty",
            "--no-color-output",
        ]
    )


def killMyPyDaemon():
    subprocess.run(["dmypy", "stop"])


def withTempFile(write, in_file_with_suffix, then_do):
    # set delete=False to avoid permission errors
    with tempfile.NamedTemporaryFile(
        dir=os.getcwd(),
        mode="w+",
        prefix="runcoder_temp_",
        suffix=in_file_with_suffix,
        delete=False,
    ) as temp_file:
        temp_file.write(write)
        temp_file_path = os.path.relpath(temp_file.name)

    try:
        return then_do(temp_file_path)
    except subprocess.CalledProcessError as e:
        print(e, flush=True)
        print(e.stdout, flush=True)
        print(e.stderr, flush=True)
        return e
    finally:
        os.remove(temp_file_path)
