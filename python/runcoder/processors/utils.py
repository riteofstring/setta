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


def subprocessWithTempFile(contents, fn):
    with tempfile.TemporaryDirectory(dir=".") as temp_dir:
        # set delete=False to avoid permission errors
        with tempfile.NamedTemporaryFile(
            dir=temp_dir, mode="w+", suffix=".py", delete=False
        ) as temp_file:
            temp_file.write(contents)
            temp_file_path = temp_file.name

        try:
            return fn(temp_file_path)
        except subprocess.CalledProcessError as e:
            print(e, flush=True)
            print(e.stdout, flush=True)
            print(e.stderr, flush=True)
            return e
