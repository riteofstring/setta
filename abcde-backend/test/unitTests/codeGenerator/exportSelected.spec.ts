import { loadOneProject } from 'abcde-test/src/loadTestData';
import { exportSelected } from 'src/middleware/codeGenerator/exportSelected';

test('export simpleTrainTest', async () => {
  const p = await loadOneProject({ forCodeGen: true });
  const selected = exportSelected(p);
  const correct = {
    'V~Model': {
      'O~torchvision.models.resnet152': {
        'P~num_layers': 'S~13',
      },
    },
    'V~Optimizer': {},
    'V~Transform': {},
    'V~TrainDataset': {},
    'V~ValDataset': {},
    'V~OtherParameters': {
      'P~dataset_root': 'S~70',
      'P~dog_power': 'S~9000',
    },
    'V~The2ndOtherParameters': {},
    'V~X': {
      'P~birth_details': {},
    },
    'V~TransformNum2': {
      'O~torchvision.transforms.Compose': {
        'P~transforms': [
          {
            'O~torchvision.transforms.AutoAugment': {
              'P~color': 'S~red',
              'P~transparency': 'S~true',
            },
          },
        ],
      },
    },
  };
  expect(selected).toEqual(correct);
});
