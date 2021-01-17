import sys

sys.path.insert(
    0,
    "D:\\Documents\\App Development\\ABCDE\\ui_specifier\\integration_tests\\reading_specs/../../src",
)
from torch.optim import Adadelta

from ui_specifier.templates.simple_train_test import Net

Model = Net()
Optimizer = Adadelta
from ui_specifier.templates.pytorch_factories import optimizer_factory

Optimizer = optimizer_factory(
    model=Model,
    optimizer=Optimizer,
    lr=1,
)
