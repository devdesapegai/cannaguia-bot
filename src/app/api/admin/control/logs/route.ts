import { logEmitter } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  const encoder = new TextEncoder();
  let onLog: ((event: Record<string, unknown>) => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      onLog = (event: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          cleanup();
        }
      };

      logEmitter.on("log", onLog);

      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          cleanup();
        }
      }, 30_000);

      function cleanup() {
        if (onLog) { logEmitter.removeListener("log", onLog); onLog = null; }
        if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
      }
    },
    cancel() {
      if (onLog) { logEmitter.removeListener("log", onLog); onLog = null; }
      if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
