import type { CaptureResult, EngineResponse, EngineTransportRequest } from "@/src/shared/rpc";

export function wikiAutoCompileSourceId(
  request: EngineTransportRequest,
  response: EngineResponse,
): string | undefined {
  if (!isCaptureRequest(request) || !response.ok) return undefined;
  const result = response.value as Partial<CaptureResult> | undefined;
  if (result?.status !== "saved") return undefined;
  const sourceId = result.memory?.id;
  return typeof sourceId === "string" && sourceId.trim().length > 0 ? sourceId : undefined;
}

function isCaptureRequest(request: EngineTransportRequest) {
  return (
    request.kind === "capturePage" ||
    request.kind === "captureSelection" ||
    request.kind === "captureMarkdown" ||
    request.kind === "capturePdf"
  );
}
