from setta.cli import Setta
import time

from setta.cli.logger import SettaImg, SettaList, pil_to_setta_img

logger = Setta()

print("logger.root_path", logger.root_path)

all_data = {"size": [], "elephant": []}

for i in range(100):
    all_data["size"].append(i)
    all_data["elephant"].append(i*3)
    logger.log({"frogdog": SettaList(all_data)}, save_to="db")
    time.sleep(1)


# # Test the fix with different parameter names
# from setta.code_gen.python.ast_utils import find_missing_imports


# test_code = """
# class A:
#     def __init__(this):  # Using 'this' instead of 'self'
#         this.some_attr = None

#     def another_fn(cls):  # Using 'cls' instead of 'self'
#         cls.some_attr.doing_something()
# """
# correct = set()

# print(find_missing_imports(test_code) == correct)  # Should print set()

# # Test with a more complex example
# test_code = """
# class MyClass:
#     def __init__(me):  # Unusual parameter name
#         me.torch = None
        
#     def process(self):
#         torch.nn.Linear(10, 10)  # This should be detected as missing import
#         self.torch.tensor([1,2,3])  # This should not be flagged
# """
# correct = set(["torch", "torch.nn"])

# print(find_missing_imports(test_code) == correct)  # Should print {'torch', 'torch.nn'}


# # Test with a more complex example
# test_code = """
# class DataProcessor:
#     def __init__(self):
#         self.items = []
        
#     def process(self):
#         result = [self.items.process() for _ in range(10)]
#         return [numpy.array(x) for x in result]
# """
# correct = set(["numpy"])

# print(find_missing_imports(test_code) == correct)  # Should print {'numpy'}

# # Test with a more complex example
# test_code = """
# class Mapper:
#     def transform(self):
#         self.data = {k: self.process(v) for k, v in items.items()}
#         return {k: pandas.Series(v) for k, v in self.data.items()}
# """
# correct = set(["pandas", "items"])

# print(find_missing_imports(test_code) == correct)  # Should print {'pandas', 'items'}


# # Test with a more complex example
# test_code = """
# class Functional:
#     def __init__(self):
#         self.values = []
        
#     def apply(self):
#         self.values.map(lambda x: tensorflow.reduce_sum(x))
#         self.toolkit.map(lambda x: self.process(x))
# """
# correct = set(["tensorflow"])

# print(find_missing_imports(test_code) == correct) 

# # Test with a more complex example
# test_code = """
# class Parent:
#     def __init__(self):
#         self.torch = None
        
# class Child(Parent, mixin.BaseMixin):
#     def __init__(self):
#         super().__init__()
#         self.torch.nn.Module()
# """
# correct = set(["mixin"])

# print(find_missing_imports(test_code) == correct) 


# # Test with a more complex example
# test_code = """
# class AsyncProcessor:
#     async def process(self):
#         self.client = None
#         result = await aiohttp.ClientSession()
#         await self.client.process()
# """
# correct = set(["aiohttp"])
# print(find_missing_imports(test_code) == correct) 


# # Test with a more complex example
# test_code = """
# class TypedClass:
#     def __init__(self) -> None:
#         self.processor: Optional[Processor] = None
        
#     def process(self, data: numpy.ndarray) -> torch.Tensor:
#         return self.processor.convert(data)
# """
# correct = set(["Optional", "Processor", "numpy", "torch"])
# print(find_missing_imports(test_code) == correct) 


# test_code = """
# data = numpy.array([1, 2, 3])
# result = pandas.DataFrame(data)
# """
# correct = set(["numpy", "pandas"])
# print(find_missing_imports(test_code) == correct) 


# test_code = """
# def process_data(data):
#     return tensorflow.reduce_sum(data)
    
# def transform(x):
#     return sklearn.preprocessing.scale(x)
# """
# correct = set(["tensorflow", "sklearn", "sklearn.preprocessing"])
# print(find_missing_imports(test_code) == correct) 


# test_code = """
# def process_data(data):
#     return tensorflow.reduce_sum(data)
    
# def transform(x):
#     return sklearn.preprocessing.scale(x)
# """
# correct = set(["tensorflow", "sklearn", "sklearn.preprocessing"])
# print(find_missing_imports(test_code) == correct) 


# test_code = """
# def outer():
#     x = torch.tensor([1, 2, 3])
    
#     def inner():
#         return scipy.fft(x)
        
#     return inner
# """
# correct = set(["torch", "scipy"])
# print(find_missing_imports(test_code) == correct) 


# test_code = """
# def generate_data():
#     for item in items:
#         yield numpy.fft.fft(item)
        
# def stream_process():
#     return (torch.nn.functional.relu(x) for x in data)
# """
# correct = set(["items", "data", "numpy", "numpy.fft", "torch", "torch.nn", "torch.nn.functional"])
# print(find_missing_imports(test_code) == correct) 


# test_code = """
# @pytest.fixture
# @mock.patch('service.api')
# def test_service(mock_api):
#     return requests.get('http://api.example.com')
# """
# correct = set(["pytest", "mock", "requests"])
# print(find_missing_imports(test_code) == correct) 


# test_code = """
# async def fetch_data():
#     client = aiohttp.ClientSession()
#     async with httpx.AsyncClient() as client:
#         await asyncio.sleep(1)
# """
# correct = set(["aiohttp", "httpx", "asyncio"])
# print(find_missing_imports(test_code) == correct) 


# test_code = """
# from typing import List

# def process_array(data: numpy.ndarray) -> torch.Tensor:
#     return cv2.imread(PIL.Image.fromarray(data))
# """
# correct = set(["numpy", "torch", "cv2", "PIL", "PIL.Image"])
# print(find_missing_imports(test_code) == correct) 