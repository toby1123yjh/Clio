import type { PageContext } from "@/src/rail/app/rail-state";

export const locationChangeEventName = "clio:location-change";

export function readPageContext(): PageContext {
  return {
    url: location.href,
    title: document.title || location.hostname,
  };
}

export function installSpaLocationObserver(onChange: () => void) {
  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);
  history.pushState = (...args: Parameters<History["pushState"]>) => {
    const result = originalPushState(...args);
    window.dispatchEvent(new Event(locationChangeEventName));
    onChange();
    return result;
  };
  history.replaceState = (...args: Parameters<History["replaceState"]>) => {
    const result = originalReplaceState(...args);
    window.dispatchEvent(new Event(locationChangeEventName));
    onChange();
    return result;
  };
  return () => {
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;
  };
}
