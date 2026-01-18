import unittest

from setta.api.runner import SettaRunner
from setta.types.dependency_key import SectionParamDependencyKey
from setta.types.id import ID


class RunnerParamOverrideTests(unittest.TestCase):
    def test_encode_param_overrides_accepts_dependency_key(self) -> None:
        runner = SettaRunner(base_url="http://example.com")
        key = SectionParamDependencyKey(sectionId=ID("section"), codeObjId=ID("param"))
        overrides = runner._encode_param_overrides({key: "2"})
        self.assertEqual(overrides, {"section:param": "2"})
