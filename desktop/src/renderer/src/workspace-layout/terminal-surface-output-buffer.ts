const maxPendingOutputChunks = 640;

export interface PendingTerminalOutput {
  byteCount: number;
  dataBase64: string;
}

export class TerminalOutputBuffer {
  private droppedOutputChunks = 0;
  private readonly pendingOutput: PendingTerminalOutput[] = [];

  get droppedChunkCount(): number {
    return this.droppedOutputChunks;
  }

  get hasPending(): boolean {
    return this.pendingOutput.length > 0;
  }

  get pendingChunkCount(): number {
    return this.pendingOutput.length;
  }

  addDroppedChunks(count: number): void {
    this.droppedOutputChunks += count;
  }

  drain(): PendingTerminalOutput[] {
    return this.pendingOutput.splice(0);
  }

  enqueue(output: PendingTerminalOutput): void {
    this.pendingOutput.push(output);
    const overflow = this.pendingOutput.length - maxPendingOutputChunks;
    if (overflow <= 0) {
      return;
    }
    this.pendingOutput.splice(0, overflow);
    this.droppedOutputChunks += overflow;
  }

  resetDroppedChunks(): void {
    this.droppedOutputChunks = 0;
  }
}
