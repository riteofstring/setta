import glob
from runcoder_test.load_test_data import read_ts_file, write_ts_file


def name_not_args_or_kwargs(v):
    return v["name"] not in ["args", "kwargs"]


def remove_non_existent_children(v, all_code_info):
    v["children"] = [x for x in v["children"] if x in all_code_info]
    v["inCodeParentId"] = v["inCodeParentId"] if v["inCodeParentId"] in all_code_info else None


def remove_args_kwargs(contents):
    new_contents = {}
    for k,v in contents.items():
        if isinstance(v, dict) and name_not_args_or_kwargs(v):
            new_contents[k] = v
        elif isinstance(v, list):
            new_contents[k] = [x for x in v if name_not_args_or_kwargs(x)]
    return new_contents
            

def update_children_parent(contents, all_code_info):
    for v in contents.values():
        if isinstance(v, dict):
            remove_non_existent_children(v, all_code_info)
        elif isinstance(v, list):
            for x in v:
                remove_non_existent_children(x, all_code_info)
    return contents


def update_evcols_uitypecols(contents, all_code_info):
    new_contents = {}
    for col_id, col in contents.items():
        new_contents[col_id] = {}
        for param_id, v in col.items():
            if param_id in all_code_info:
                new_contents[col_id][param_id] = v
    return new_contents



def main():
    all_code_info = {}
    for filename in ["pytorch", "pytorchLightning", "pytorchLightningMnist"]:
        filepath = f"src/data/_codeInfo/{filename}.ts"
        new_contents = remove_args_kwargs(read_ts_file(filepath))
        write_ts_file(new_contents, filepath)
        all_code_info = {**all_code_info, **new_contents}

    matches = glob.glob(f"src/data/**/**/KwargInfo.ts")
    for f in matches:
        all_code_info = {**all_code_info, **read_ts_file(f)}

    for filename in ["pytorch", "pytorchLightning", "pytorchLightningMnist"]:
        filepath = f"src/data/_codeInfo/{filename}.ts"
        new_contents = update_children_parent(read_ts_file(filepath), all_code_info)
        write_ts_file(new_contents, filepath)


    for filename in ["AllCodeInfo", "AllCollections", "Callables", "ParamCollections", "Params"]:
        matches = glob.glob(f"src/data/**/**/{filename}.ts")
        for f in matches:
            new_contents = remove_args_kwargs(read_ts_file(f))
            new_contents = update_children_parent(new_contents, all_code_info)
            write_ts_file(new_contents, f)
            

    for filename in ["EVCols", "UITypeCols"]:
        matches = glob.glob(f"src/data/**/**/{filename}.ts")
        for f in matches:
            new_contents = update_evcols_uitypecols(read_ts_file(f), all_code_info)
            write_ts_file(new_contents, f)

main()