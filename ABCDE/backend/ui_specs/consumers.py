import json

from asgiref.sync import async_to_sync
from backend_utils.utils import query_string_parser
from channels.generic.websocket import WebsocketConsumer
from django.conf import settings
from ui_specifier.utils.yaml_parsing import generate_code


def generate_code_helper(input_dict):
    ui_selections = input_dict["SELECTED"]
    factory_specs = input_dict["FACTORIES"]
    funcs = input_dict["FUNCS"]
    ui_repr = generate_code(ui_selections, factory_specs, funcs)
    return str(ui_repr)


def get_group_name(scope):
    userid = str(scope["user"].id)
    query_string = scope["query_string"]
    source = query_string_parser(query_string, "source")
    return f"{settings.CLI_WEBSOCKET_GROUP_NAME}_{userid}_{source}", userid, source


def get_outgoing_group_name(scope):
    _, userid, source = get_group_name(scope)
    if source == "browser":
        outgoing = "cli"
    elif source == "cli":
        outgoing = "browser"
    return f"{settings.CLI_WEBSOCKET_GROUP_NAME}_{userid}_{outgoing}"


class CLISyncConsumer(WebsocketConsumer):
    def connect(self):
        self.group_name, _, _ = get_group_name(self.scope)
        async_to_sync(self.channel_layer.group_add)(self.group_name, self.channel_name)
        print("connect", self.group_name, self.channel_name, self.scope["query_string"])
        self.accept()

    def disconnect(self, close_code):
        async_to_sync(self.channel_layer.group_discard)(
            self.group_name, self.channel_name
        )

    def receive(self, text_data):
        outgoing = get_outgoing_group_name(self.scope)
        data_to_send = json.loads(text_data)
        if "enteredText" in data_to_send:
            output_dict = {"enteredText": data_to_send["enteredText"]}
        elif "code" in data_to_send:
            gen_code = generate_code_helper(data_to_send["code"])
            output_dict = {"code": gen_code}
        output_dict["type"] = "cli"
        async_to_sync(self.channel_layer.group_send)(outgoing, output_dict)

    def cli(self, event):
        self.send(text_data=json.dumps(event))
