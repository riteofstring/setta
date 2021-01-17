import sys
sys.path.insert(0, 'D:\\Documents\\App Development\\ABCDE\\ui_specifier\\integration_tests\\reading_specs/../../src')
from ui_specifier.templates.simple_train_test import Net
from torch.optim import Adadelta
Model=Net()
Optimizer=Adadelta
Adadeltax=Net()
from ui_specifier.templates.pytorch_factories import optimizer_factory
Optimizer=optimizer_factory(model=Adadeltax,optimizer=Optimizer,lr=1,)
