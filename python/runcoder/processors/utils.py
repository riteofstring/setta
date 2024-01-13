import os
import subprocess
import tempfile
import inspect


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


async def withTempFiles(write, in_file_with_suffix, then_do, auto_delete=True):
    if len(write) != len(in_file_with_suffix):
        raise ValueError("Writes and suffixes lists must have the same length.")

    temp_files = []
    try:
        # Create temporary files
        for w, suffix in zip(write, in_file_with_suffix):
            temp_file = tempfile.NamedTemporaryFile(
                dir=os.getcwd(),
                mode="w+",
                prefix="runcoder_temp_",
                suffix=suffix,
                delete=False,
            )
            temp_file.write(w)
            temp_file.flush()
            temp_files.append(temp_file)

        # Get the relative paths of all temporary files
        temp_file_paths = [os.path.relpath(temp_file.name) for temp_file in temp_files]

        if inspect.iscoroutinefunction(then_do):
            return await then_do(temp_file_paths)
        else:
            return then_do(temp_file_paths)

    except subprocess.CalledProcessError as e:
        print(e, flush=True)
        print(e.stdout, flush=True)
        print(e.stderr, flush=True)
        return e

    finally:
        if auto_delete:
            # Clean up the temporary files
            for temp_file in temp_files:
                temp_file.close()
                os.remove(temp_file.name)
