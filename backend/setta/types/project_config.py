from pydantic import model_validator
from setta.types.generated.go_shared_types import (
    ProjectCodegenLanguage,
    ProjectCodegenPluginTarget,
)
from setta.types.generated.go_shared_types import (
    ProjectConfig as GoProjectConfig,
)


class ProjectConfig(GoProjectConfig):
    @model_validator(mode="after")
    def _validate_codegen_targets(self):
        seen: set[str] = set()
        for target in self.codegenTargets:
            if isinstance(target, ProjectCodegenPluginTarget):
                normalized = target.language.strip()
                if normalized == "":
                    raise ValueError("Plugin codegen target language cannot be empty.")
                if normalized == ProjectCodegenLanguage.python.value:
                    raise ValueError("Plugin codegen target language cannot be python.")
                if normalized != target.language:
                    target.language = normalized
                language = normalized
            else:
                language = target.language.value
            if language in seen:
                raise ValueError(f"Duplicate codegen target language: {language}")
            seen.add(language)
        return self
