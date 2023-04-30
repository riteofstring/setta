import { useZundoTest } from "models/zundoTest";
import { MenuBarButton } from "utils/atoms/buttons/MenuBarButton";

export function ZundoTest() {
  const value = useZundoTest((x) => x.value["dog"]);
  const increment = useZundoTest((x) => x.increment);
  const decrement = useZundoTest((x) => x.decrement);

  function undo() {
    useZundoTest.temporal.getState().undo();
  }

  return (
    <>
      <MenuBarButton onClick={() => increment("dog")}>+</MenuBarButton>
      {value}
      <MenuBarButton onClick={() => decrement("dog")}>-</MenuBarButton>
      <MenuBarButton onClick={undo}>undo</MenuBarButton>
    </>
  );
}
