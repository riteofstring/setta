import inspect
from pathlib import Path
from typing import Any, List, Type
from pydantic import BaseModel
from setta.utils.utils import get_absolute_path


def find_sub_classes(
    module: Any,
    base_class: Type[BaseModel],
) -> List[Type[BaseModel]]:
    classes = []

    # Get all classes that match our criteria
    for _, obj in inspect.getmembers(module, inspect.isclass):
        if issubclass(obj, base_class):
            classes.append(obj)

    # Sort by line number where the class is defined
    def get_line_number(cls):
        try:
            return inspect.getsourcelines(cls)[1]
        except (OSError, TypeError):
            return float("inf")  # Put classes without source at the end

    classes.sort(key=get_line_number)

    return classes


def main(output_folder):
    import setta.types.section_impls

    classes = find_sub_classes(
        setta.types.section_impls,
        setta.types.section_impls.BaseSectionImpl,
    )

    code = """
from typing import Any

from pydantic import BaseModel, Field

from setta.database.utils import create_new_id
from setta.utils.generate_memorable_string import generate_memorable_string  
"""

    for c in classes:
        if c.__name__ == "BaseSectionImpl":
            code += """
class BaseSectionCore(BaseModel, extra="forbid"):
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    implLayerings: list[str] = Field(default_factory=list)
    defaultImplLayering: str | None = None
    type: Any
    sharedModifier: Any
    unsharedKeys: Any

"""
        else:
            class_name = c.__name__.rstrip("Impl") + "Core"
            parent_class_names = ", ".join(
                b.__name__.rstrip("Impl") + "Core" for b in c.__bases__
            )
            code += f"""
class {class_name}({parent_class_names}):


"""

    print(code)


if __name__ == "__main__":
    main(get_absolute_path(__file__, Path("../../backend/setta/types/generated")))
