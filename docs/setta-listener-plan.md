Here's a sketch of an idea: I want to provide a class that can be used something like this:

```python
from setta.api import SettaListener

sl = SettaListener()

# listen to all changes on frontend
@sl.listen
def fn():
    # do something


# listen to specific frontend inputs, and debounce fn2.
@sl.listen(dep=[...], debounce=100)
def fn2():
    # do another thing


if __name__ == "__main__":
    # start listening and keep listening until the script is killed
    sl.start()
```