export interface ComposerSubmitKeyEvent {
  key: string;
  code: string;
  shiftKey: boolean;
  nativeEvent: {
    isComposing?: boolean;
  };
}

export function isComposerSubmitKeyEvent(event: ComposerSubmitKeyEvent) {
  return (
    (event.key === "Enter" || event.code === "Enter" || event.code === "NumpadEnter") &&
    !event.shiftKey &&
    !isComposingKeyEvent(event)
  );
}

function isComposingKeyEvent(event: ComposerSubmitKeyEvent) {
  return (
    event.nativeEvent.isComposing === true ||
    (event.key === "Process" && event.code !== "Enter" && event.code !== "NumpadEnter")
  );
}
