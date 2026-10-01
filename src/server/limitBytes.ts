export class TooLargeError extends Error {
  constructor() {
    super('Response body is too large');
  }
}

/** Passes the stream through and errors with TooLargeError once more than `maxBytes` have been read. */
export function limitBytes(body: ReadableStream<Uint8Array>, maxBytes: number): ReadableStream<Uint8Array> {
  let seen = 0;
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        seen += chunk.byteLength;
        if (seen > maxBytes) {
          controller.error(new TooLargeError());
          return;
        }
        controller.enqueue(chunk);
      },
    }),
  );
}
