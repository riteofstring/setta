import sys

sys.path.insert(
    0,
    "D:\\Documents\\App Development\\ABCDE\\ui_specifier\\integration_tests\\reading_specs/../../src",
)
from torch.optim import Adadelta
from torchvision.transforms import Compose, Normalize, ToTensor

from ui_specifier.templates.pytorch_factories import optimizer_factory
from ui_specifier.templates.simple_train_test import Net

Netx = Adadelta
stdx = 0.3081
std = [stdx]
meanx = 0.1307
mean = [meanx]
transformsxx = Normalize(mean=mean, std=std)
transformsx = ToTensor()
transforms = [transformsx, transformsxx]
lr = 0.1
Model = Net()
Transform = Compose(transforms=transforms)
Netx = optimizer_factory(model=Model, optimizer=Netx, kwargs={"lr": lr})
