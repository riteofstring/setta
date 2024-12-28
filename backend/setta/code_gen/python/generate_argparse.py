from ...utils.constants import C


def generate_argparse(selected):
    output = []
    for s in selected.values():
        if "paramInfoId" not in s:
            continue
        if s["type"] == C.SWITCH:
            if s["value"] == "true":
                output.append(f"--{s['name']}")
        else:
            output.append(f"--{s['name']} {s['value']}")
    return " ".join(output)
