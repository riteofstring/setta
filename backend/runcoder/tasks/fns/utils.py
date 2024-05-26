import os
import subprocess
import tempfile


def withTempFiles(write, in_file_with_suffix, then_do, auto_delete=True):
    if len(write) != len(in_file_with_suffix):
        raise ValueError("Writes and suffixes lists must have the same length.")

    temp_files = []
    try:
        dir_name = ".runcoder_code"
        os.makedirs(dir_name, exist_ok=True)
        # Create temporary files
        for w, suffix in zip(write, in_file_with_suffix):
            temp_file = tempfile.NamedTemporaryFile(
                dir=dir_name,
                mode="w+",
                prefix="runcoder_temp_",
                suffix=suffix,
                delete=False,
            )
            temp_file.write(w)
            temp_file.flush()
            temp_files.append(temp_file)

        # Get the relative paths of all temporary files
        temp_file_paths = [
            os.path.relpath(temp_file.name).replace(os.sep, "/")
            for temp_file in temp_files
        ]

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
