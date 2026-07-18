export class BoundedSampleRingOverflowError extends Error {
  constructor(
    readonly capacityFrames: number,
    readonly queuedFrames: number,
    readonly incomingFrames: number,
  ) {
    super(
      `Buffered microphone queue capacity ${capacityFrames} cannot retain ${incomingFrames} incoming frames with ${queuedFrames} already queued.`,
    );
    this.name = "BoundedSampleRingOverflowError";
  }
}

export class BoundedSampleRing {
  private readonly samples: Float32Array;
  private queued = 0;
  private readIndex = 0;

  constructor(readonly capacityFrames: number) {
    if (!Number.isInteger(capacityFrames) || capacityFrames < 1) {
      throw new Error("Bounded sample ring capacity must be a positive integer.");
    }
    this.samples = new Float32Array(capacityFrames);
  }

  get availableFrames(): number {
    return this.capacityFrames - this.queued;
  }

  get queuedFrames(): number {
    return this.queued;
  }

  clear(): void {
    this.samples.fill(0);
    this.queued = 0;
    this.readIndex = 0;
  }

  push(input: Float32Array): void {
    if (input.length > this.availableFrames) {
      throw new BoundedSampleRingOverflowError(this.capacityFrames, this.queued, input.length);
    }
    if (input.length === 0) {
      return;
    }
    const writeIndex = (this.readIndex + this.queued) % this.capacityFrames;
    const firstWriteFrames = Math.min(input.length, this.capacityFrames - writeIndex);
    this.samples.set(input.subarray(0, firstWriteFrames), writeIndex);
    if (firstWriteFrames < input.length) {
      this.samples.set(input.subarray(firstWriteFrames), 0);
    }
    this.queued += input.length;
  }

  read(output: Float32Array): number {
    if (output.length === 0 || this.queued === 0) {
      return 0;
    }
    const framesToRead = Math.min(output.length, this.queued);
    const firstReadFrames = Math.min(framesToRead, this.capacityFrames - this.readIndex);
    output.set(this.samples.subarray(this.readIndex, this.readIndex + firstReadFrames), 0);
    this.samples.fill(0, this.readIndex, this.readIndex + firstReadFrames);
    if (firstReadFrames < framesToRead) {
      const wrappedFrames = framesToRead - firstReadFrames;
      output.set(this.samples.subarray(0, wrappedFrames), firstReadFrames);
      this.samples.fill(0, 0, wrappedFrames);
    }
    this.queued -= framesToRead;
    this.readIndex = this.queued === 0 ? 0 : (this.readIndex + framesToRead) % this.capacityFrames;
    return framesToRead;
  }
}
