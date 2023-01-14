import glob
import pathlib
import pyjson5

def read_ts_file(filename):
    with open(filename, 'r') as f:
        x = f.read()
    
    x = x.strip().replace("export default", "")
    if x[-1] == ";":
        x = x[:-1]
    return pyjson5.decode(x)


def load_global_code_info():
    this_dir = pathlib.Path(__file__).parent.resolve()
    data_path = this_dir / ".." / ".." / "src" / "data" / "_codeInfo" / "*"
    files = glob.glob(str(data_path))
    
    x = {}
    for filename in files:
        x[pathlib.Path(filename).stem] = read_ts_file(filename)

    return x