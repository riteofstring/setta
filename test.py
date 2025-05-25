import ast
import re
from typing import Dict, List, Optional, Union
from dataclasses import dataclass

@dataclass
class FieldInfo:
    name: str
    type_name: str
    default_value: Optional[str]
    is_optional: bool
    description: str = ""

@dataclass
class EnumInfo:
    name: str
    values: Dict[str, str]
    base_type: str = "string"

@dataclass
class ModelInfo:
    name: str
    fields: List[FieldInfo]
    extra_config: str = ""

class PydanticToZodConverter:
    def __init__(self):
        self.enums: List[EnumInfo] = []
        self.models: List[ModelInfo] = []
        self.type_mapping = {
            'str': 'z.string()',
            'int': 'z.number().int()',
            'float': 'z.number()',
            'bool': 'z.boolean()',
            'list[str]': 'z.array(z.string())',
            'list[int]': 'z.array(z.number().int())',
            'List[str]': 'z.array(z.string())',
            'List[int]': 'z.array(z.number().int())',
            'dict': 'z.record(z.any())',
            'dict[str, str]': 'z.record(z.string())',
            'dict[str, int]': 'z.record(z.number().int())',
            'Optional[str]': 'z.string().nullable()',
            'Optional[int]': 'z.number().int().nullable()',
            'Optional[bool]': 'z.boolean().nullable()',
        }
    
    def parse_python_file(self, file_path: str):
        """Parse Python file and extract Pydantic models and enums"""
        with open(file_path, 'r') as f:
            content = f.read()
        
        tree = ast.parse(content)
        
        for node in ast.walk(tree):
            if isinstance(node, ast.ClassDef):
                if self._is_enum_class(node):
                    self.enums.append(self._parse_enum(node))
                elif self._is_pydantic_model(node):
                    self.models.append(self._parse_model(node, content))
    
    def _is_enum_class(self, node: ast.ClassDef) -> bool:
        """Check if class inherits from StrEnum or similar"""
        for base in node.bases:
            if isinstance(base, ast.Name) and base.id in ['StrEnum', 'Enum', 'IntEnum']:
                return True
        return False
    
    def _is_pydantic_model(self, node: ast.ClassDef) -> bool:
        """Check if class inherits from BaseModel"""
        for base in node.bases:
            if isinstance(base, ast.Name) and base.id == 'BaseModel':
                return True
        return False
    
    def _parse_enum(self, node: ast.ClassDef) -> EnumInfo:
        """Parse enum class definition"""
        values = {}
        for stmt in node.body:
            if isinstance(stmt, ast.Assign):
                for target in stmt.targets:
                    if isinstance(target, ast.Name):
                        if isinstance(stmt.value, ast.Constant):
                            values[target.id] = stmt.value.value
        
        return EnumInfo(name=node.name, values=values)
    
    def _parse_model(self, node: ast.ClassDef, source_code: str) -> ModelInfo:
        """Parse Pydantic model class definition"""
        fields = []
        extra_config = ""
        
        # Extract extra config
        for stmt in node.body:
            if isinstance(stmt, ast.Assign):
                for target in stmt.targets:
                    if isinstance(target, ast.Name) and target.id == 'extra':
                        extra_config = "strict" if "forbid" in ast.unparse(stmt.value) else ""
        
        # Parse annotated fields
        for stmt in node.body:
            if isinstance(stmt, ast.AnnAssign) and isinstance(stmt.target, ast.Name):
                field_name = stmt.target.id
                type_annotation = ast.unparse(stmt.annotation)
                
                # Extract default value and Field info
                default_value = None
                description = ""
                
                if stmt.value:
                    if isinstance(stmt.value, ast.Call) and isinstance(stmt.value.func, ast.Name) and stmt.value.func.id == 'Field':
                        # Parse Field() call
                        for keyword in stmt.value.keywords:
                            if keyword.arg == 'default_factory':
                                factory_func = ast.unparse(keyword.value)
                                # Convert Python factory functions to JavaScript equivalents
                                if factory_func == 'list':
                                    default_value = "[]"
                                elif factory_func == 'dict':
                                    default_value = "{}"
                                elif factory_func == 'set':
                                    default_value = "new Set()"
                                else:
                                    # Check if it's a model class (capitalized, likely a Pydantic model)
                                    if factory_func[0].isupper():
                                        default_value = f"create{factory_func}()"
                                    else:
                                        default_value = f"{factory_func}()"
                            elif keyword.arg == 'default':
                                default_value = ast.unparse(keyword.value)
                            elif keyword.arg == 'description':
                                description = keyword.value.value if isinstance(keyword.value, ast.Constant) else ""
                    else:
                        default_value = ast.unparse(stmt.value)
                        # Convert Python None to JavaScript null
                        if default_value == "None":
                            default_value = "null"
                
                is_optional = 'Optional' in type_annotation or default_value is not None
                
                fields.append(FieldInfo(
                    name=field_name,
                    type_name=type_annotation,
                    default_value=default_value,
                    is_optional=is_optional,
                    description=description
                ))
        
        return ModelInfo(name=node.name, fields=fields, extra_config=extra_config)
    
    def generate_typescript(self) -> str:
        """Generate TypeScript code with Zod schemas"""
        output = []
        
        # Add imports
        output.append("import { z } from 'zod';")
        output.append("import { createNewId, generateMemorableString } from './utils';")
        output.append("")
        
        # Generate enums
        for enum in self.enums:
            output.append(f"// {enum.name} enum")
            output.append(f"export const {enum.name}Schema = z.enum([")
            enum_values = [f"  '{value}'" for value in enum.values.values()]
            output.append(",\n".join(enum_values))
            output.append("]);")
            output.append(f"export type {enum.name} = z.infer<typeof {enum.name}Schema>;")
            output.append(f"export const {enum.name} = {enum.name}Schema.enum;")
            output.append("")
        
        # Generate model schemas
        for model in self.models:
            output.append(f"// {model.name} schema")
            output.append(f"export const {model.name}Schema = z.object({{")
            
            for field in model.fields:
                zod_type = self._convert_type_to_zod(field.type_name)
                default_clause = ""
                
                if field.default_value:
                    if field.default_value in ["[]", "{}", "new Set()"]:
                        # JavaScript literal values
                        default_clause = f".default(() => ({field.default_value}))"
                    elif field.default_value.endswith("()"):
                        # Function call - use .default()
                        func_name = field.default_value[:-2]
                        default_clause = f".default(() => {func_name}())"
                    elif field.default_value == "null":
                        # Null value
                        default_clause = f".default(null)"
                    elif field.default_value.startswith('"') or field.default_value.startswith("'"):
                        # String literal
                        default_clause = f".default({field.default_value})"
                    elif field.default_value in ['True', 'False']:
                        # Boolean
                        bool_val = field.default_value.lower()
                        default_clause = f".default({bool_val})"
                    elif field.default_value.replace('.', '').replace('-', '').isdigit():
                        # Number
                        default_clause = f".default({field.default_value})"
                    else:
                        # Enum or other value
                        default_clause = f".default({field.default_value})"
                
                # Use .optional() only if field can be omitted (no default) and is Optional
                optional_clause = ""
                if field.is_optional and not default_clause:
                    if 'Optional[' in field.type_name:
                        optional_clause = ".optional()"
                    else:
                        optional_clause = ".optional()"
                
                line = f"  {field.name}: {zod_type}{default_clause}{optional_clause},"
                output.append(line)
            
            output.append("});")
            
            if model.extra_config == "strict":
                output[-1] = output[-1].replace("});", "}).strict();")
            
            output.append(f"export type {model.name} = z.infer<typeof {model.name}Schema>;")
            output.append("")
            
            # Generate factory function
            output.append(f"// {model.name} factory function")
            output.append(f"export function create{model.name}(input: Partial<{model.name}> = {{}}): {model.name} {{")
            output.append(f"  return {model.name}Schema.parse(input);")
            output.append("}")
            output.append("")
        
        return "\n".join(output)
    
    def _convert_type_to_zod(self, python_type: str) -> str:
        """Convert Python type annotation to Zod schema"""
        # Handle direct mappings
        if python_type in self.type_mapping:
            return self.type_mapping[python_type]
        
        # Handle enum types
        for enum in self.enums:
            if enum.name in python_type:
                return f"{enum.name}Schema"
        
        # Handle generic types
        if python_type.startswith('List[') or python_type.startswith('list['):
            # Extract inner type from List[T] or list[T]
            inner_start = python_type.index('[') + 1
            inner_end = python_type.rindex(']')
            inner_type = python_type[inner_start:inner_end]
            inner_zod = self._convert_type_to_zod(inner_type)
            return f"z.array({inner_zod})"
        
        # Handle Union types
        if python_type.startswith('Union['):
            # Extract union members
            inner_start = python_type.index('[') + 1
            inner_end = python_type.rindex(']')
            inner = python_type[inner_start:inner_end]
            
            # Split union members, handling nested brackets
            members = []
            bracket_depth = 0
            current_member = ""
            
            for char in inner:
                if char == '[':
                    bracket_depth += 1
                elif char == ']':
                    bracket_depth -= 1
                elif char == ',' and bracket_depth == 0:
                    members.append(current_member.strip())
                    current_member = ""
                    continue
                current_member += char
            
            if current_member.strip():
                members.append(current_member.strip())
            
            # Convert each member to Zod
            zod_members = []
            for member in members:
                if member.startswith('Literal['):
                    # Handle Literal types
                    literal_value = member[8:-1]  # Remove 'Literal[' and ']'
                    # Check if it's an enum reference
                    if '.' in literal_value:
                        enum_ref = literal_value.split('.')[0]
                        enum_value = literal_value.split('.')[1]
                        zod_members.append(f"z.literal({enum_ref}.{enum_value})")
                    else:
                        zod_members.append(f"z.literal({literal_value})")
                else:
                    zod_members.append(self._convert_type_to_zod(member))
            
            return f"z.union([{', '.join(zod_members)}])"
        
        if python_type.startswith('dict['):
            # Handle dict[K, V] types
            inner_start = python_type.index('[') + 1
            inner_end = python_type.rindex(']')
            inner = python_type[inner_start:inner_end]
            if ',' in inner:
                key_type, value_type = [t.strip() for t in inner.split(',', 1)]
                if key_type == 'str':
                    value_zod = self._convert_type_to_zod(value_type)
                    return f"z.record({value_zod})"
            return "z.record(z.any())"
        
        if python_type == 'dict':
            return "z.record(z.any())"
        
        if python_type.startswith('Optional['):
            inner_type = python_type[9:-1]
            inner_zod = self._convert_type_to_zod(inner_type)
            return f"{inner_zod}.nullable()"
        
        # Default to string for unknown types
        return "z.string()"

def main():
    converter = PydanticToZodConverter()
    
    # Parse your Python file
    converter.parse_python_file("backend/setta/project_state/project_state.py")
    
    # Generate TypeScript code
    typescript_code = converter.generate_typescript()
    
    # Write to file
    with open("frontend/src/utils/generated_schemas.ts", "w") as f:
        f.write(typescript_code)
    
    print("TypeScript schemas generated successfully!")
    print("\nGenerated code preview:")
    print("=" * 50)
    print(typescript_code[:1000] + "..." if len(typescript_code) > 1000 else typescript_code)

if __name__ == "__main__":
    main()