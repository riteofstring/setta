I want to brainstorm and discuss ideas related to DependencyGraph, PythonCodeGenerator, SettaListener, and ListenerRealtimeDelta.

In this application, a user creates various UI elements on the frontend, and fills in those UI elements with "values", whether those are strings, numbers, dictionaries, or more complex things like canvas drawings.

The UI elements and their values get "compiled" into code. At present, the only supported code is Python, so the UI elements and values get compiled into a Python representation. This is done via DependencyGraph and PythonCodeGenerator. This code is saved to disk, and can then be run like any other Python script.

There is another mode of operation which involves the SettaListener. In this mode, we still have the frontend elements and values, as well as the generated Python code. But the user now writes a separate "listener" script that connects to the backend by websocket. This script can listen to specific changes from the frontend, in realtime, and send back updates. This allows for the creation of real time interactive applications.

SettaListener uitilizes DependencyGraph and PythonCodeGenerator internally so that it contains the same "compiled" representation as the backend does. When a ListenerRealtimeDelta arrives, it applies the delta to the cached representation.

ListenerRealtimeDelta only supports one type of delta, which is the "value" of a parameter in a section. This is represented by a sectionId, codeObjId, and value. (An analagous representation is that a "section" is a like a json object, and a codeObj is like a key in that json object.)

I want ListenerRealtimeDelta to be able to support other types of deltas. For example, you should be able to draw in the DrawArea section type (basically a canvas element) and have the listener script receive the new drawing in near realtime, to allow for near realtime interactive drawing applications. (It doesn't have to be actual realtime, as sending a drawing obviously is more expensive than sending simple values like strings or numbers.)

This ties in with DependencyGraph and PythonCodeGenerator. Since SettaListener uses these to create its own local "state", DependencyGraph and PythonCodeGenerator should support all the types that ListenerRealtimeDelta supports, and vice versa. Not only will this enhance the realtime functionality of this application, but it will also enhance the "click and run" functionality too, since the "saved-to-disk" python script will have access to these types.

I think the challenges here are:
- determining how the variables for various types should be named. There is a naming convention in DependencyGraph, but it is done mainly with the sectionId, codeObjId concept in mind.
- determining how complex types should be represented in the generated code. For example, I think it makes sense for canvas drawings to be sent, received, and represented as base64 when used in SettaListener. But when used in the "saved to disk" python code, perhaps the drawing should be saved to disk as a png, and then loaded at run time. Therefore, perhaps DependencyGraph and/or PythonCodeGenerator need to take into account the running mode (realtime vs saved-to-disk)

Other thoughts:
- it would be nice to have a good vocabulary for describing realtime vs "saved-to-disk" mode (I don't really like "saved-to-disk" as the term.)
- I'm curious how "jsonSource" sections should be represented. These sections look like any other section, but their contents are saved to json files (in the future, this will be expanded to yaml, toml etc.). Should the generated python code read directly from the json file, or just treat the section like any other section?
- I'm wondering about creating a special section type for "environment variables". This doesn't exist yet, but I'm wondering if it would be useful, and how it fits into our broader discussion.