from django.db import models
from django.contrib.auth.models import User

# Create your models here.

class SavedUIs(models.Model):
    owner = models.ForeignKey(User, on_delete=models.CASCADE)
    uiName = models.TextField()
    sections = models.TextField()
    selections = models.TextField()
    globalCurr = models.TextField()