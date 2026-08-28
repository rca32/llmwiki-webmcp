import { waitUntil } from "cloudflare:workers";
import type { ApiOutcome } from "./request-outcome";

type RequestObservation = {
  commandName: string;
  startedAt: number;
};

const activeRequests = new Map<string, RequestObservation>();
const COMMAND_NAME = /^[a-z][a-z0-9_.-]{0,79}$/;

export function startApiRequest(commandName: string) {
  if (!COMMAND_NAME.test(commandName))
    throw new Error(`Invalid API command name: ${commandName}`);
  const id = `req_${crypto.randomUUID()}`;
  activeRequests.set(id, { commandName, startedAt: performance.now() });
  return id;
}

export function completeApiRequest(requestId: string, outcome: ApiOutcome) {
  const observation = activeRequests.get(requestId);
  if (!observation) return;
  activeRequests.delete(requestId);
  const latencyMs = Math.max(
    0,
    Math.min(300_000, Math.round(performance.now() - observation.startedAt)),
  );
  const recording = import("../db/wiki-repository")
    .then(({ recordApiRequestMetric }) =>
      recordApiRequestMetric({
        commandName: observation.commandName,
        outcome,
        latencyMs,
        requestId,
      }),
    )
    .catch((error: unknown) => {
      console.error("API observability recording failed", error);
    });
  waitUntil(recording);
}
