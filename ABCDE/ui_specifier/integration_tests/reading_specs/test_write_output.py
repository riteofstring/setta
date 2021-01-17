import sys
sys.path.insert(0, 'D:\\Documents\\App Development\\ABCDE\\ui_specifier\\integration_tests\\reading_specs/../../src')
from ui_specifier.templates.simple_train_test import Net
from torch.optim import Adadelta
from torchvision.datasets import MNIST
from torchvision.transforms import ToTensor
from torchvision.transforms import Normalize
from torchvision.transforms import Compose
Model=Net()
Optimizer=Adadelta
TrainDataset=MNIST
ValDataset=MNIST
Transform_0_0=ToTensor()
Transform_0_1=Normalize(mean=[0.1307],std=[0.3081],)
Transform=Compose(transforms=[Transform_0_0, Transform_0_1],)
from ui_specifier.templates.pytorch_factories import optimizer_factory
from ui_specifier.templates.pytorch_factories import dataset_factory
Optimizer=optimizer_factory(model=Model,optimizer=Optimizer,lr=1,)
TrainDataset=dataset_factory(dataset=TrainDataset,transform=Transform,transforms=[Transform_0_0, Transform_0_1],train=True,download=True,)
ValDataset=dataset_factory(dataset=ValDataset,transform=Transform,transforms=[Transform_0_0, Transform_0_1],train=False,download=True,)
