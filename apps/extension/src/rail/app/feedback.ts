import { EngineRpcError } from "@/src/shared/rpc";

export interface ToastState {
  tone: "success" | "warning" | "error";
  message: string;
}

export function errorToast(error: unknown): ToastState {
  if (error instanceof EngineRpcError) {
    return {
      tone: error.code === "LOW_CONFIDENCE_EXTRACTION" ? "warning" : "error",
      message: error.message,
    };
  }
  if (error instanceof Error) {
    return {
      tone: "error",
      message: error.message,
    };
  }
  return {
    tone: "error",
    message: "Clio could not complete that action.",
  };
}
