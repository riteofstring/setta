import sys

sys.path.insert(
    0,
    "D:\\Documents\\App Development\\ABCDE\\ui_specifier\\integration_tests\\reading_specs/../../src",
)
from torch.optim import Adadelta
from torchvision.models import resnet18
from torchvision.transforms import Compose, Normalize, ToTensor

from ui_specifier.templates.simple_train_test import Net

Model = Net()
Optimizer = Adadelta
Transform_0_0_0_0 = ToTensor()
Transform_0_0_0_1 = Normalize(
    mean=[0.1307],
    std=[0.3081],
)
Transform_0_0_0_2 = resnet18()
Transform_0_0 = Compose(
    transforms=[Transform_0_0_0_0, Transform_0_0_0_1, Transform_0_0_0_2],
)
Transform_0_1 = Net()
Transform = Compose(
    transforms=[Transform_0_0, Transform_0_1],
)
from ui_specifier.templates.pytorch_factories import optimizer_factory

Optimizer = optimizer_factory(
    model=Model,
    optimizer=Optimizer,
    lr=1,
)
