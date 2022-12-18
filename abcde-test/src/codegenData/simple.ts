export default {
  "V~ImportantList": ["R~Optimizer", "R~Transform", "R~X"],

  "V~Model": {
    "O~torchvision.models.resnet101": {
      "P~pretrained": true,
      "P~progress": true,
    },
  },

  "V~Optimizer": {},

  "V~Transform": {
    "O~torchvision.transforms.Compose": {
      "P~transforms": [
        {
          "O~torchvision.transforms.RandomCrop": {
            "P~size": 256,
            "P~padding": 5,
          },
        },

        {
          "O~torchvision.transforms.ColorJitter": {},
        },
      ],
    },
  },

  "V~TrainDataset": {},

  "V~ValDataset": {},

  "V~OtherParameters": {
    "P~batch_size": 32,
    "P~some_names": [],
    "P~do_it": true,
  },

  "V~Embedder": "R~Model",

  "V~X": [[], [1, 2, 3], 5, { "P~dogs": "S~fluffy" }, null],
};
