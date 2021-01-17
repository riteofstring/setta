from ui_specifier.utils import yaml_parsing as yp
import unittest
import os

class DumbClass:
    x=5
    def __repr__(self):
        return f"{self.x*2}"

class TestParamRepr(unittest.TestCase):
    def test_param_repr(self):
        R = yp.ParamRepr("x", 3)
        self.assertTrue(str(R) == "x=3")

        R = yp.ParamRepr("x")
        # self.assertRaises(AssertionError, lambda: str(R) == "x=None")

        R = yp.ParamRepr("x", DumbClass())
        self.assertTrue(str(R) == "x=10")


class TestParamsRepr(unittest.TestCase):
    def test_params_repr(self):
        P = {x:yp.ParamRepr(x, y) for (x,y) in [("a",1), ("b",2), ("c","3"), ("d", DumbClass())]}
        R = yp.ParamsRepr(P)
        self.assertTrue(str(R)=="a=1,b=2,c=\"3\",d=10")


class TestImportRepr(unittest.TestCase):
    def test_import_repr(self):
        R = yp.ImportRepr("torchvision.transforms", "Compose")
        self.assertTrue(str(R) == "from torchvision.transforms import Compose\n")

        R = yp.ImportRepr("torchvision.transforms", "Compose", "SpecialCompose")
        self.assertTrue(str(R) == "from torchvision.transforms import Compose as SpecialCompose\n")


class TestObjRepr(unittest.TestCase):
    def test_obj_repr(self):
        R = yp.ObjRepr("Net", yp.ParamsRepr({}))
        self.assertTrue(str(R) == "Net()")
        
        R = yp.ObjRepr("Net", yp.ParamsRepr({}), False)
        self.assertTrue(str(R) == "Net")

        param_dict = {}
        P = yp.ParamsRepr(param_dict)
        R = yp.ObjRepr("Net", P)
        self.assertTrue(str(R) == "Net()")        



class TestVarRepr(unittest.TestCase):
    def test_var_repr(self):
        P = {x:yp.ParamRepr(x, y) for (x,y) in [("a",1), ("b",2), ("c","3"), ("d", DumbClass())]}
        P = yp.ParamsRepr(P)
        P = yp.ObjRepr("Net", P)
        P = yp.VarRepr("Model", P)
        self.assertTrue(str(P) == "Model=Net(a=1,b=2,c=\"3\",d=10)\n")



class TestReprFromYaml(unittest.TestCase):
    def test_repr_from_yaml(self):
        curr_dir = os.path.dirname(os.path.abspath(__file__))
        ui_selections = yp.load_yaml(
            os.path.join(curr_dir, "yaml_example.yaml")
        )
        ui_repr = yp.UIRepr()
        yp.create_objects(ui_selections, ui_repr)
        print("")
        print(ui_repr)