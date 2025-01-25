import re


def process_diagnostics_response(response, get_code_metadata):
    params = response["params"]
    diagnostics = params["diagnostics"]
    uri = params["uri"]
    version = params.get("version")
    if get_code_metadata(uri)["version"] != version:
        return None, False
    # needsDiagnostics = version_info["needsDiagnostics"]

    print(response, flush=True)

    return None, False
    # if not needsDiagnostics:
    #     return None, needsDiagnostics

    # sectionId = version_info["sectionId"]
    # code = version_info["code"]
    # codeJson = version_info["codeJson"]

    # print("process_diagnostics_response uri", uri, flush=True)

    # print("process_diagnostics_response code", code, flush=True)

    # code_split = code.split("\n")
    # content = process_diagnostics(diagnostics, code_split, codeJson)
    # # print("content", content, flush=True)
    # return content


def process_diagnostics(diagnostics, code_split, codeJson):
    output = {}
    for d in diagnostics:
        r = d["range"]
        start, end = r["start"], r["end"]
        if "code" not in d:
            continue
        if d["code"] == "reportArgumentType":
            problem_var = code_split[start["line"]][
                start["character"] : end["character"]
            ].strip()
            if codeJson:
                set_message(codeJson, problem_var, output, d["message"])
        elif d["code"] == "reportCallIssue":
            if "missing" not in d["message"]:
                continue
            missing_params = extract_parameters(d["message"])
            # get variable to the left of the equal sign
            assigned_to = code_split[start["line"]].split("=")[0].strip()
            unusedParams = codeJson[assigned_to]["value"]["unusedParams"]
            for potential_problem_var in unusedParams:
                if codeJson[potential_problem_var]["name"] in missing_params:
                    set_message(codeJson, potential_problem_var, output, d["message"])
    return output


def set_message(code_json, problem_var, output, message):
    print("set_message", problem_var)
    section_id, param_info_id = (
        code_json[problem_var]["sectionId"],
        code_json[problem_var]["paramInfoId"],
    )

    if section_id not in output:
        output[section_id] = {}
    if param_info_id not in output[section_id]:
        output[section_id][param_info_id] = []

    output[section_id][param_info_id].append(message)


def extract_parameters(error_string):
    pattern = r'"([^"]+)"'
    parameters = re.findall(pattern, error_string)
    return parameters
