import glob
from runcoder_test.load_test_data import read_ts_file
import itertools

def validate_code_info():
    files = glob.glob("src/data/_codeInfo/*")
    all_code_info = {}
    for f in files:
        all_code_info = {**all_code_info, **read_ts_file(f)}

    for info in all_code_info.values():
        if info['inCodeParentId'] and info['inCodeParentId'] not in all_code_info:
            raise ValueError(f"inCodeParentId {info['inCodeParentId']} does not exist")
        for c in info['children']:
            if c not in all_code_info:
                raise ValueError(f"child {c} does not exist")
            

def validate_code_info():
    files = glob.glob("src/data/_codeInfo/*")
    all_code_info = {}
    for f in files:
        all_code_info = {**all_code_info, **read_ts_file(f)}

    for id, info in all_code_info.items():
        if info['inCodeParentId'] and info['inCodeParentId'] not in all_code_info:
            raise ValueError(f"inCodeParentId {info['inCodeParentId']} does not exist")
        for c in info['children']:
            if c not in all_code_info:
                raise ValueError(f"child {c} does not exist")
            

def validate_users():
    all_project_files = glob.glob("src/data/**/Project.ts")
    all_project_ids = [read_ts_file(f)['id'] for f in all_project_files]
    user_project_ids = list(itertools.chain.from_iterable([x['projects'] for x in read_ts_file("src/data/Users.ts").values()]))

    if set(all_project_ids) != set(user_project_ids):
        raise ValueError



validate_code_info()
validate_users()