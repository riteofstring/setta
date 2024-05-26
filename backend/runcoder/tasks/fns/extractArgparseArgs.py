from runcoder.code_gen.python.extract_args_from_help import extract_args_from_help


def extractArgparseArgs(message):
    script_path = message["message"]
    output = extract_args_from_help(script_path)
    return {"output": output, "name": "extractArgparseArgs", "cache": None}
