import glob
from runcoder_test.load_test_data import read_ts_file
import itertools

def load_all(glob_string):
    fs = glob.glob(glob_string)
    output = {}
    for f in fs:
        output = {**output, **read_ts_file(f)}
    return output


def load_all_code_info():
    return load_all("src/data/_codeInfo/*")

def load_all_kwarg_info():
    return load_all("src/data/**/**/KwargInfo.ts")

def load_all_sections():
    return load_all("src/data/**/**/Sections.ts")

def load_all_section_configs():
    return load_all("src/data/**/**/SectionConfigs.ts")

def load_all_evcols():
    return load_all("src/data/**/**/EVCols.ts")   


def validate_code_info():
    all_code_info = load_all_code_info()
    for info in all_code_info.values():
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


def validate_sections():
    all_sections = load_all_sections()
    all_code_info = {**load_all_code_info(), **load_all_kwarg_info()}
    for s in all_sections.values():
        if s['paramInfoId'] and s['paramInfoId'] not in all_code_info:
            raise ValueError(f"paramInfoId {s['paramInfoId']} does not exist")
        

def validate_section_configs():
    configs = load_all_section_configs()
    all_code_info = {**load_all_code_info(), **load_all_kwarg_info()}
    for s in configs.values():
        if s['selectedItem'] and s['selectedItem'] not in all_code_info:
            raise ValueError(f"selectedItem {s['selectedItem']} does not exist")


def validate_evcols():
    evcols = load_all_evcols()
    all_code_info = {**load_all_code_info(), **load_all_kwarg_info()}
    for evcol in evcols.values():
        for cid, evid in evcol.items():
            if cid not in all_code_info:
                raise ValueError(f"code info {cid} does not exist")



validate_code_info()
validate_users()
validate_sections()
validate_section_configs()
validate_evcols()