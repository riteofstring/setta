from pytorch_lightning.loggers.logger import Logger
from pytorch_lightning.utilities import rank_zero_only
from runcoder import Runcoder


class RuncoderLogger(Logger):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.rc_logger = Runcoder()

    @property
    def name(self):
        return "RuncoderLogger"

    @property
    def version(self):
        # Return the experiment version, int or str.
        return "0.1"

    @rank_zero_only
    def log_hyperparams(self, params):
        # params is an argparse.Namespace
        # your code to record hyperparameters goes here
        pass

    @rank_zero_only
    def log_metrics(self, metrics, step):
        # metrics is a dictionary of metric names and values
        # your code to record metrics goes here
        if (step + 1) % 1000 == 0:
            print("logging")
            self.rc_logger.log("losses", "loss", metrics["loss"])
        pass

    @rank_zero_only
    def save(self):
        # Optional. Any code necessary to save logger data goes here
        pass

    @rank_zero_only
    def finalize(self, status):
        # Optional. Any code that needs to be run after training
        # finishes goes here
        pass
