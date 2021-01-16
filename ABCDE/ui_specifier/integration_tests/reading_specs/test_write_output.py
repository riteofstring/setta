import sys

sys.path.insert(
    0,
    "D:\\Documents\\App Development\\ABCDE\\ui_specifier\\integration_tests\\reading_specs/../../src",
)
from ui_specifier.templates.simple_train_test import Net

Model = Net()
from torch.optim import Adadelta

from ui_specifier.templates.pytorch_factories import optimizer_factory

Optimizer = Adadelta
Optimizer = optimizer_factory(
    model=Model,
    optimizer=Optimizer,
    lr=1,
)
