import sys
sys.path.insert(0, 'D:\\Documents\\App Development\\ABCDE\\ui_specifier\\integration_tests\\reading_specs/../../src')
from ui_specifier.templates.simple_train_test import Net
from torch.optim import Adadelta
from torchvision.transforms import Compose
from torchvision.transforms import ToTensor
from torchvision.transforms import Normalize
stdx=0.3081
std=[stdx]
meanx=0.1307
mean=[meanx]
transformsxx=Normalize(mean=mean,std=std)
transformsx=ToTensor()
transforms=[transformsx,transformsxx]
lr=1
Model=Net()
Optimizer=Adadelta
Transform=Compose(transforms=transforms)
