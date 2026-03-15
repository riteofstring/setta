import type { WebsocketMsg } from "utils/generatedTypes";

export type FrontendWebsocketMessageContext = {
  socketGeneration: number;
  isSocketGenerationCurrent: (socketGeneration: number) => boolean;
  isSocketOpen: () => boolean;
  sendMessageForGeneration: (
    message: WebsocketMsg,
    socketGeneration: number,
  ) => void;
};
