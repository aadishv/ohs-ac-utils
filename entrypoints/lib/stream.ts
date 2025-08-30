export function wrapAsyncGenerator<T, TArgs extends any[]>(
  generatorFn: (...args: TArgs) => AsyncGenerator<T>
): (...args: TArgs) => Promise<ReadableStream<T>> {
  return function(...args: TArgs): Promise<ReadableStream<T>> {
    return new Promise((resolve, reject) => {
      try {
        const underlyingSource: UnderlyingSource<T> = {
          async start(controller: ReadableStreamController<T>) {
            try {
              const asyncIterator = generatorFn(...args);
              for await (const chunk of asyncIterator) {
                (controller as ReadableStreamDefaultController<T>).enqueue(chunk);
              }
              (controller as ReadableStreamDefaultController<T>).close();
            } catch (error) {
              controller.error(error);
            }
          },
          cancel(reason?: any) {
            console.log('Stream canceled:', reason);
          },
        };
        const readableStream = new ReadableStream<T>(underlyingSource);
        resolve(readableStream);
      } catch (error) {
        reject(error);
      }
    });
  };
}

// async function* countUp(to: number, delayMs: number): AsyncGenerator<string> {
//   for (let i = 1; i <= to; i++) {
//     await new Promise(resolve => setTimeout(resolve, delayMs));
//     yield `Count: ${i}`;
//   }
// }

// async function main() {
//   console.log("Wrapping the async generator...");
//   const createCountingStream = wrapAsyncGenerator(countUp);

//   console.log("Calling the wrapped function to get a stream promise...");
//   const streamPromise = createCountingStream(5, 500);

//   const stream = await streamPromise;
//   console.log("Stream created. Now consuming it...");

//   const reader = stream.getReader();

//   try {
//     while (true) {
//       const { done, value } = await reader.read();
//       if (done) {
//         console.log("Stream finished.");
//         break;
//       }
//       console.log("Received chunk:", value);
//     }
//   } catch (error) {
//     console.error("An error occurred while reading the stream:", error);
//   } finally {
//       reader.releaseLock();
//   }
// }

// main();

export function listToReadableStream<T>(list: T[]): ReadableStream<T> {
  let index = 0; // Keep track of the current element to enqueue

  return new ReadableStream<T>({
    pull(controller) {
      if (index < list.length) {
        // Enqueue the next element from the list
        controller.enqueue(list[index]);
        index++;
      } else {
        // All elements have been enqueued, close the stream
        controller.close();
      }
    },
    cancel() {
      // Optional: Handle cleanup if the stream is cancelled
      console.log('Stream cancelled');
    }
  });
}
