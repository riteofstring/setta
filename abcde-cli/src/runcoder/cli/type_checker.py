from .mypy_parsing import parse_all_errors


def parse_and_type_check(message, code, code_json):
    type_check_results = parse_all_errors(message)
    return type_check(type_check_results, code, code_json)


def type_check(type_check_results, code, code_json):
    code_split = code.split("\n")
    output = {}

    for t in type_check_results:
        if t["code"] == "argType":
            parse_arg_type_error(t, code_split, code_json, output)
        elif t["code"] == "missingArgs":
            parse_missing_or_unexpected_arg_error(
                t, code_split, code_json, output, True
            )
        elif t["code"] == "unexpectedKeywordArg":
            parse_missing_or_unexpected_arg_error(
                t, code_split, code_json, output, False
            )

    return output


def parse_arg_type_error(error, code_split, code_json, output):
    problem_var = code_split[int(error["line"]) - 1][
        int(error["column"]) - 1 : int(error["endColumn"])
    ]
    set_message(code_json, problem_var, output, error["message"])


def parse_missing_or_unexpected_arg_error(
    error, code_split, code_json, output, missing
):
    print("error.badVars", error["badVars"])
    problem_var = code_split[int(error["line"]) - 1].split("=")[0]
    params = (
        code_json[problem_var]["value"]["unusedParams"]
        if missing
        else code_json[problem_var]["value"]["params"]
    )

    for p in params:
        if code_json[p]["name"] in error["badVars"]:
            set_message(code_json, p, output, error["message"])


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
