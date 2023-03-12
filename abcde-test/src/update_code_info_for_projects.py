import glob
from runcoder_test.load_test_data import read_ts_file, write_ts_file

def main():
    all_code_info = {}
    for filename in ["pytorch", "pytorchLightning", "pytorchLightningMnist"]:
        filepath = f"src/data/_codeInfo/{filename}.ts"
        all_code_info = {**all_code_info, **read_ts_file(filepath)}

    for filename in ["AllCodeInfo", "Callables", "ParamCollections", "Params"]:
        matches = glob.glob(f"src/data/**/**/{filename}.ts")
        for f in matches:
            contents = read_ts_file(f)
            for k,v in contents.items():
                if isinstance(v, dict):
                    contents[k] = all_code_info.get(k, contents[k])
                elif isinstance(v, list):
                    contents[k] = [all_code_info.get(x["id"], x) for x in v]
            write_ts_file(contents, f)


main()