GLOBAL_REF_DICT = {}


def add_to_ref_dict(**kwargs):
    print("ADD_TO_REF_DICT")
    for k, v in kwargs.items():
        print("KEY {}   VALUE {}".format(k,v))
        GLOBAL_REF_DICT[k] = v
