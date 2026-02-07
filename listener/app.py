import math

from setta.api import SettaListener


def build_listener(listener: SettaListener) -> None:
    @listener.listen(deps=["dull_ocean__x"], run_on_refresh=True)
    async def update_output(state, ctx) -> None:
        x = float(state.dull_ocean__x)
        await ctx.emit_to_frontend(
            dependency_values={"app_output": f"The value is {math.sqrt(x)}"}
        )
