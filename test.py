import ast
from typing import Any, Dict, List, Optional, Set
from dataclasses import dataclass, field

@dataclass
class FieldInfo:
    name: str
    type_name: str
    default_value: Optional[str]
    is_optional: bool
    description: str = ""
    constraints: Dict[str, Any] = field(default_factory=dict)

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
    config_dict: Dict[str, Any] = field(default_factory=dict)

class PydanticToZodConverter:
    def __init__(self):
        self.enums: List[EnumInfo] = []
        self.models: List[ModelInfo] = []
        self.model_names: Set[str] = set()  # Track model names for references
        
        # Extended type mapping
        self.type_mapping = {
            'str': 'z.string()',
            'int': 'z.number().int()',
            'float': 'z.number()',
            'bool': 'z.boolean()',
            'bytes': 'z.instanceof(Uint8Array)',
            'datetime': 'z.string().datetime()',
            'date': 'z.string().date()',
            'time': 'z.string().time()',
            'UUID': 'z.string().uuid()',
            'Decimal': 'z.number()',
            'list': 'z.array(z.any())',
            'dict': 'z.record(z.any())',
            'set': 'z.array(z.any())',
            'tuple': 'z.tuple([])',
            'Any': 'z.any()',
            'None': 'z.null()',
            'list[str]': 'z.array(z.string())',
            'list[int]': 'z.array(z.number().int())',
            'List[str]': 'z.array(z.string())',
            'List[int]': 'z.array(z.number().int())',
            'Dict[str, str]': 'z.record(z.string())',
            'Dict[str, int]': 'z.record(z.number().int())',
            'Set[str]': 'z.array(z.string())',
            'Set[int]': 'z.array(z.number().int())',
            'Optional[str]': 'z.string().nullable()',
            'Optional[int]': 'z.number().int().nullable()',
            'Optional[bool]': 'z.boolean().nullable()',
            'Optional[datetime]': 'z.string().datetime().nullable()',
            'Optional[date]': 'z.string().date().nullable()',
            'Optional[UUID]': 'z.string().uuid().nullable()',
        }
    
    def _snake_to_camel(self, snake_str: str) -> str:
        """Convert snake_case to camelCase"""
        components = snake_str.split('_')
        return components[0] + ''.join(x.title() for x in components[1:])
    
    def parse_python_file(self, file_path: str):
        """Parse Python file and extract Pydantic models and enums"""
        try:
            with open(file_path, 'r') as f:
                content = f.read()
            
            tree = ast.parse(content)
            
            # First pass: collect all model names
            for node in ast.walk(tree):
                if isinstance(node, ast.ClassDef) and self._is_pydantic_model(node):
                    self.model_names.add(node.name)
            
            # Second pass: parse models and enums
            for node in ast.walk(tree):
                if isinstance(node, ast.ClassDef):
                    try:
                        if self._is_enum_class(node):
                            self.enums.append(self._parse_enum(node))
                        elif self._is_pydantic_model(node):
                            self.models.append(self._parse_model(node, content))
                    except Exception as e:
                        print(f"Warning: Failed to parse class {node.name}: {e}")
                        
        except Exception as e:
            print(f"Error parsing file {file_path}: {e}")
            raise
    
    def _is_enum_class(self, node: ast.ClassDef) -> bool:
        """Check if class inherits from StrEnum or similar"""
        for base in node.bases:
            if isinstance(base, ast.Name) and base.id in ['StrEnum', 'Enum', 'IntEnum']:
                return True
            # Handle from enum import Enum style
            if isinstance(base, ast.Attribute) and base.attr in ['StrEnum', 'Enum', 'IntEnum']:
                return True
        return False
    
    def _is_pydantic_model(self, node: ast.ClassDef) -> bool:
        """Check if class inherits from BaseModel"""
        for base in node.bases:
            if isinstance(base, ast.Name) and base.id == 'BaseModel':
                return True
            # Handle from pydantic import BaseModel style
            if isinstance(base, ast.Attribute) and base.attr == 'BaseModel':
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
                            values[target.id] = str(stmt.value.value)
        
        return EnumInfo(name=node.name, values=values)
    
    def _parse_model(self, node: ast.ClassDef, source_code: str) -> ModelInfo:
        """Parse Pydantic model class definition"""
        fields = []
        extra_config = ""
        config_dict = {}
        
        # First check for inheritance-style config (BaseModel, extra="forbid")
        for base in node.bases:
            if isinstance(base, ast.Name) and base.id == 'BaseModel':
                # Check if there are keywords in the inheritance
                for keyword in node.keywords:
                    if keyword.arg == 'extra' and isinstance(keyword.value, ast.Constant):
                        extra_config = "strict" if keyword.value.value == 'forbid' else ""
                    config_dict[keyword.arg] = ast.unparse(keyword.value) if hasattr(keyword, 'value') else ""
        
        # Parse model config (Pydantic v2 style)
        for stmt in node.body:
            if isinstance(stmt, ast.AnnAssign) and isinstance(stmt.target, ast.Name):
                if stmt.target.id == 'model_config':
                    # Parse ConfigDict
                    if isinstance(stmt.value, ast.Call) and hasattr(stmt.value.func, 'id') and stmt.value.func.id == 'ConfigDict':
                        for keyword in stmt.value.keywords:
                            if keyword.arg == 'extra' and isinstance(keyword.value, ast.Constant):
                                extra_config = "strict" if keyword.value.value == 'forbid' else ""
                            config_dict[keyword.arg] = ast.unparse(keyword.value)
            
            # Also check for Pydantic v1 style Config class
            if isinstance(stmt, ast.ClassDef) and stmt.name == 'Config':
                for config_stmt in stmt.body:
                    if isinstance(config_stmt, ast.Assign):
                        for target in config_stmt.targets:
                            if isinstance(target, ast.Name) and target.id == 'extra':
                                if isinstance(config_stmt.value, ast.Constant):
                                    extra_config = "strict" if config_stmt.value.value == 'forbid' else ""
        
        # Parse annotated fields
        for stmt in node.body:
            if isinstance(stmt, ast.AnnAssign) and isinstance(stmt.target, ast.Name):
                field_name = stmt.target.id
                
                # Skip special fields
                if field_name in ['model_config', 'Config']:
                    continue
                    
                type_annotation = ast.unparse(stmt.annotation)
                
                # Extract default value and Field info
                default_value = None
                description = ""
                constraints = {}
                
                if stmt.value:
                    if isinstance(stmt.value, ast.Call) and isinstance(stmt.value.func, ast.Name) and stmt.value.func.id == 'Field':
                        # Parse Field() call
                        for keyword in stmt.value.keywords:
                            if keyword.arg == 'default_factory':
                                factory_func = ast.unparse(keyword.value)
                                
                                # Handle copy.deepcopy specifically
                                if factory_func.startswith('lambda: copy.deepcopy'):
                                    # Extract the argument to copy.deepcopy
                                    deepcopy_match = factory_func[factory_func.find('copy.deepcopy(') + 14:]
                                    if deepcopy_match.endswith(')'):
                                        deepcopy_match = deepcopy_match[:-1]
                                    # Remove any surrounding quotes if it's a string literal
                                    toClone = deepcopy_match.strip().strip('"\'')
                                    default_value = f"() => _.cloneDeep({toClone})"
                                # Convert Python factory functions to JavaScript equivalents
                                elif factory_func == 'list':
                                    default_value = "[]"
                                elif factory_func == 'dict':
                                    default_value = "{}"
                                elif factory_func == 'set':
                                    default_value = "[]"  # Sets become arrays in JS
                                else:
                                    # Convert snake_case to camelCase for function names
                                    camel_func = self._snake_to_camel(factory_func)
                                    
                                    # Check if it's a model class
                                    if factory_func in self.model_names:
                                        # For model factories, use create + PascalCase model name
                                        default_value = f"() => create{factory_func}()"
                                    elif factory_func.startswith('lambda'):
                                        # Handle lambda expressions
                                        lambda_content = factory_func.replace('lambda:', '').strip()
                                        if lambda_content.endswith('()'):
                                            func_name = lambda_content[:-2]
                                            if func_name in self.model_names:
                                                default_value = f"() => create{func_name}()"
                                            else:
                                                camel_func_name = self._snake_to_camel(func_name)
                                                default_value = f"() => {camel_func_name}()"
                                        else:
                                            default_value = f"() => {lambda_content}"
                                    else:
                                        default_value = f"() => {camel_func}()"
                            elif keyword.arg == 'default':
                                default_value = ast.unparse(keyword.value)
                                if default_value == "None":
                                    default_value = "null"
                            elif keyword.arg == 'description':
                                description = keyword.value.value if isinstance(keyword.value, ast.Constant) else ""
                            # Capture constraints
                            elif keyword.arg in ['min_length', 'max_length', 'gt', 'ge', 'lt', 'le', 'regex', 'min_items', 'max_items']:
                                constraints[keyword.arg] = ast.unparse(keyword.value)
                    else:
                        default_value = ast.unparse(stmt.value)
                        # Convert Python None to JavaScript null
                        if default_value == "None":
                            default_value = "null"
                
                is_optional = 'Optional' in type_annotation or 'None' in type_annotation or default_value is not None
                
                fields.append(FieldInfo(
                    name=field_name,
                    type_name=type_annotation,
                    default_value=default_value,
                    is_optional=is_optional,
                    description=description,
                    constraints=constraints
                ))
        
        return ModelInfo(name=node.name, fields=fields, extra_config=extra_config, config_dict=config_dict)
    
    def generate_typescript(self) -> str:
        """Generate TypeScript code with Zod schemas"""
        output = []
        
        # Add imports
        output.append("import { z } from 'zod';")
        output.append("import _ from 'lodash';")
        output.append('import { createNewId, createRandomName as generateMemorableString } from "utils/idNameCreation";')
        
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
                
                # Apply constraints
                if field.constraints:
                    zod_type = self._apply_constraints(zod_type, field.constraints, field.type_name)
                
                default_clause = ""
                
                if field.default_value:
                    if field.default_value in ["[]", "{}"]:
                        # JavaScript literal values
                        default_clause = f".default(() => ({field.default_value}))"
                    elif field.default_value.startswith("() =>"):
                        # Already a function
                        default_clause = f".default({field.default_value})"
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
                    optional_clause = ".optional()"
                
                line = f"  {field.name}: {zod_type}{default_clause}{optional_clause},"
                
                # Add comment if there's a description
                if field.description:
                    line += f" // {field.description}"
                
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
    
    def _apply_constraints(self, zod_type: str, constraints: Dict[str, Any], python_type: str) -> str:
        """Apply Pydantic constraints to Zod schema"""
        result = zod_type
        
        # String constraints
        if 'min_length' in constraints:
            result = result.replace('z.string()', f'z.string().min({constraints["min_length"]})')
        if 'max_length' in constraints:
            result = result.replace('z.string()', f'z.string().max({constraints["max_length"]})')
        if 'regex' in constraints:
            result = result.replace('z.string()', f'z.string().regex(/{constraints["regex"]}/)')
        
        # Number constraints
        if 'gt' in constraints:
            result = result.replace('z.number()', f'z.number().gt({constraints["gt"]})')
        if 'ge' in constraints:
            result = result.replace('z.number()', f'z.number().gte({constraints["ge"]})')
        if 'lt' in constraints:
            result = result.replace('z.number()', f'z.number().lt({constraints["lt"]})')
        if 'le' in constraints:
            result = result.replace('z.number()', f'z.number().lte({constraints["le"]})')
        
        # Array constraints
        if 'min_items' in constraints and 'array' in result:
            result = result.replace(')', f').min({constraints["min_items"]})')
        if 'max_items' in constraints and 'array' in result:
            result = result.replace(')', f').max({constraints["max_items"]})')
        
        return result
    
    def _convert_type_to_zod(self, python_type: str) -> str:
        """Convert Python type annotation to Zod schema"""
        # Remove whitespace
        python_type = python_type.strip()
        
        # Handle direct mappings
        if python_type in self.type_mapping:
            return self.type_mapping[python_type]
        
        # Handle model references
        if python_type in self.model_names:
            return f"{python_type}Schema"
        
        # Handle enum types
        for enum in self.enums:
            if enum.name == python_type:
                return f"{enum.name}Schema"
        
        # Handle generic types
        if python_type.startswith('List[') or python_type.startswith('list['):
            # Extract inner type from List[T] or list[T]
            inner_start = python_type.index('[') + 1
            inner_end = python_type.rindex(']')
            inner_type = python_type[inner_start:inner_end]
            inner_zod = self._convert_type_to_zod(inner_type)
            return f"z.array({inner_zod})"
        
        # Handle Set types
        if python_type.startswith('Set[') or python_type.startswith('set['):
            inner_start = python_type.index('[') + 1
            inner_end = python_type.rindex(']')
            inner_type = python_type[inner_start:inner_end]
            inner_zod = self._convert_type_to_zod(inner_type)
            return f"z.array({inner_zod})"  # Sets become arrays in JS
        
        # Handle Tuple types
        if python_type.startswith('Tuple[') or python_type.startswith('tuple['):
            inner_start = python_type.index('[') + 1
            inner_end = python_type.rindex(']')
            inner = python_type[inner_start:inner_end]
            
            # Split tuple elements
            elements = []
            bracket_depth = 0
            current_element = ""
            
            for char in inner:
                if char == '[':
                    bracket_depth += 1
                elif char == ']':
                    bracket_depth -= 1
                elif char == ',' and bracket_depth == 0:
                    elements.append(current_element.strip())
                    current_element = ""
                    continue
                current_element += char
            
            if current_element.strip():
                elements.append(current_element.strip())
            
            # Convert each element
            zod_elements = [self._convert_type_to_zod(elem) for elem in elements]
            return f"z.tuple([{', '.join(zod_elements)}])"
        
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
        
        # Handle Dict types
        if python_type.startswith('Dict[') or python_type.startswith('dict['):
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
        
        # Handle Optional types
        if python_type.startswith('Optional['):
            inner_type = python_type[9:-1]
            inner_zod = self._convert_type_to_zod(inner_type)
            return f"{inner_zod}.nullable()"
        
        # Handle | None syntax (Python 3.10+)
        if ' | None' in python_type:
            base_type = python_type.replace(' | None', '').strip()
            base_zod = self._convert_type_to_zod(base_type)
            return f"{base_zod}.nullable()"
        
        # If no match found, log warning and default to any
        print(f"Warning: Unknown type '{python_type}', defaulting to z.any()")
        return "z.any()"

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
    print(f"\nParsed {len(converter.models)} models and {len(converter.enums)} enums")
    print("\nGenerated code preview:")
    print("=" * 50)
    print(typescript_code[:1000] + "..." if len(typescript_code) > 1000 else typescript_code)

if __name__ == "__main__":
    main()