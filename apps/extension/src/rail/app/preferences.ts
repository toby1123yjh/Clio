export const railWidthStorageKey = "clio:rail-width";
export const collapsedIconRatioStorageKey = "clio:collapsed-icon-ratio";
export const collapsedLauncherPositionStorageKey = "clio:collapsed-launcher-position";
export const railThemeStorageKey = "clio:rail-theme";

export const defaultRailWidth = 432;
export const defaultCollapsedIconRatio = 0.62;
export const collapsedLauncherSize = 48;
export const defaultRailTheme: RailTheme = "light";

export type CollapsedLauncherSide = "left" | "right";
export type RailTheme = "light" | "dark";

export interface CollapsedLauncherPosition {
  side: CollapsedLauncherSide;
  yRatio: number;
}

export interface CollapsedLauncherDragPoint {
  x: number;
  y: number;
}

export const defaultCollapsedLauncherPosition: CollapsedLauncherPosition = {
  side: "right",
  yRatio: defaultCollapsedIconRatio,
};

export function clampRailWidth(width: number, viewportWidth = window.innerWidth) {
  const minWidth = Math.min(320, Math.max(280, viewportWidth - 80));
  const maxWidth = Math.max(minWidth, viewportWidth * 0.5);
  return Math.round(Math.min(Math.max(width, minWidth), maxWidth));
}

export function clampCollapsedIconRatio(ratio: number) {
  if (!Number.isFinite(ratio)) return defaultCollapsedIconRatio;
  return Math.min(Math.max(ratio, 0), 1);
}

export function collapsedIconTopFromRatio(
  ratio: number,
  viewportHeight = window.innerHeight,
  iconSize = collapsedLauncherSize,
) {
  const halfIcon = iconSize / 2;
  if (viewportHeight <= iconSize) return Math.max(0, Math.round(viewportHeight / 2));
  const unclamped = clampCollapsedIconRatio(ratio) * viewportHeight;
  return Math.round(Math.min(Math.max(unclamped, halfIcon), viewportHeight - halfIcon));
}

export function collapsedIconRatioFromTop(top: number, viewportHeight = window.innerHeight) {
  if (viewportHeight <= 0) return defaultCollapsedIconRatio;
  return clampCollapsedIconRatio(top / viewportHeight);
}

export function clampCollapsedLauncherPosition(
  position: Partial<CollapsedLauncherPosition> | undefined,
): CollapsedLauncherPosition {
  return {
    side: position?.side === "left" ? "left" : "right",
    yRatio: clampCollapsedIconRatio(position?.yRatio ?? defaultCollapsedIconRatio),
  };
}

export function normalizeRailTheme(value: unknown): RailTheme {
  return value === "dark" || value === "light" ? value : defaultRailTheme;
}

export function clampCollapsedLauncherDragPoint(
  point: CollapsedLauncherDragPoint,
  viewportWidth = window.innerWidth,
  viewportHeight = window.innerHeight,
  iconSize = collapsedLauncherSize,
): CollapsedLauncherDragPoint {
  const halfIcon = iconSize / 2;
  const minX = Math.min(halfIcon, Math.max(0, viewportWidth / 2));
  const maxX = Math.max(minX, viewportWidth - halfIcon);
  const minY = Math.min(halfIcon, Math.max(0, viewportHeight / 2));
  const maxY = Math.max(minY, viewportHeight - halfIcon);
  return {
    x: Math.round(Math.min(Math.max(point.x, minX), maxX)),
    y: Math.round(Math.min(Math.max(point.y, minY), maxY)),
  };
}

export function collapsedLauncherPositionFromPoint(
  point: CollapsedLauncherDragPoint,
  viewportWidth = window.innerWidth,
  viewportHeight = window.innerHeight,
): CollapsedLauncherPosition {
  return clampCollapsedLauncherPosition({
    side: point.x < viewportWidth / 2 ? "left" : "right",
    yRatio: collapsedIconRatioFromTop(point.y, viewportHeight),
  });
}

export async function loadRailWidthPreference() {
  const stored = await chrome.storage.local.get(railWidthStorageKey);
  const value = stored[railWidthStorageKey];
  return clampRailWidth(typeof value === "number" ? value : defaultRailWidth);
}

export async function saveRailWidthPreference(width: number) {
  await chrome.storage.local.set({ [railWidthStorageKey]: clampRailWidth(width) });
}

export async function loadCollapsedIconRatioPreference() {
  const stored = await chrome.storage.local.get(collapsedIconRatioStorageKey);
  const value = stored[collapsedIconRatioStorageKey];
  return clampCollapsedIconRatio(typeof value === "number" ? value : defaultCollapsedIconRatio);
}

export async function saveCollapsedIconRatioPreference(ratio: number) {
  await chrome.storage.local.set({
    [collapsedIconRatioStorageKey]: clampCollapsedIconRatio(ratio),
  });
}

export async function loadCollapsedLauncherPositionPreference() {
  const stored = await chrome.storage.local.get([
    collapsedLauncherPositionStorageKey,
    collapsedIconRatioStorageKey,
  ]);
  const position = stored[collapsedLauncherPositionStorageKey];
  if (isRecord(position)) {
    return clampCollapsedLauncherPosition({
      side: position.side === "left" ? "left" : "right",
      yRatio: typeof position.yRatio === "number" ? position.yRatio : defaultCollapsedIconRatio,
    });
  }

  const legacyRatio = stored[collapsedIconRatioStorageKey];
  return clampCollapsedLauncherPosition({
    side: "right",
    yRatio: typeof legacyRatio === "number" ? legacyRatio : defaultCollapsedIconRatio,
  });
}

export async function saveCollapsedLauncherPositionPreference(position: CollapsedLauncherPosition) {
  const clamped = clampCollapsedLauncherPosition(position);
  await chrome.storage.local.set({
    [collapsedLauncherPositionStorageKey]: clamped,
    [collapsedIconRatioStorageKey]: clamped.yRatio,
  });
}

export async function loadRailThemePreference() {
  const stored = await chrome.storage.local.get(railThemeStorageKey);
  return normalizeRailTheme(stored[railThemeStorageKey]);
}

export async function saveRailThemePreference(theme: RailTheme) {
  await chrome.storage.local.set({ [railThemeStorageKey]: normalizeRailTheme(theme) });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
