import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clampCollapsedLauncherDragPoint,
  clampCollapsedLauncherPosition,
  clampRailWidth,
  collapsedIconRatioStorageKey,
  collapsedLauncherPositionFromPoint,
  collapsedLauncherPositionStorageKey,
  defaultCollapsedIconRatio,
  defaultRailTheme,
  loadCollapsedLauncherPositionPreference,
  loadRailThemePreference,
  railThemeStorageKey,
  saveCollapsedLauncherPositionPreference,
  saveRailThemePreference,
} from "./preferences";

function installChromeStorage(initial: Record<string, unknown> = {}) {
  const values = { ...initial };
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        async get(keys: string | string[]) {
          if (typeof keys === "string") return { [keys]: values[keys] };
          return Object.fromEntries(keys.map((key) => [key, values[key]]));
        },
        async set(items: Record<string, unknown>) {
          Object.assign(values, items);
        },
      },
    },
  });
  return values;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("collapsed launcher preferences", () => {
  it("allows the expanded Rail to grow up to half of the viewport", () => {
    expect(clampRailWidth(2_000, 1_600)).toBe(800);
    expect(clampRailWidth(2_000, 1_920)).toBe(960);
  });

  it("keeps the Rail usable on narrow viewports even when half-width is smaller", () => {
    expect(clampRailWidth(2_000, 600)).toBe(320);
  });

  it("clamps persisted side and vertical ratio", () => {
    expect(clampCollapsedLauncherPosition({ side: "left", yRatio: 2 })).toEqual({
      side: "left",
      yRatio: 1,
    });
    expect(clampCollapsedLauncherPosition({ yRatio: Number.NaN })).toEqual({
      side: "right",
      yRatio: defaultCollapsedIconRatio,
    });
  });

  it("clamps drag points inside the viewport", () => {
    expect(clampCollapsedLauncherDragPoint({ x: -10, y: 999 }, 300, 200, 48)).toEqual({
      x: 24,
      y: 176,
    });
  });

  it("snaps released points to the nearest horizontal side", () => {
    expect(collapsedLauncherPositionFromPoint({ x: 80, y: 100 }, 300, 200)).toEqual({
      side: "left",
      yRatio: 0.5,
    });
    expect(collapsedLauncherPositionFromPoint({ x: 260, y: 100 }, 300, 200)).toEqual({
      side: "right",
      yRatio: 0.5,
    });
  });

  it("loads the new side-aware launcher position", async () => {
    installChromeStorage({
      [collapsedLauncherPositionStorageKey]: {
        side: "left",
        yRatio: 0.32,
      },
    });

    await expect(loadCollapsedLauncherPositionPreference()).resolves.toEqual({
      side: "left",
      yRatio: 0.32,
    });
  });

  it("falls back to the legacy collapsed icon ratio on first load", async () => {
    installChromeStorage({
      [collapsedIconRatioStorageKey]: 0.75,
    });

    await expect(loadCollapsedLauncherPositionPreference()).resolves.toEqual({
      side: "right",
      yRatio: 0.75,
    });
  });

  it("saves the side-aware position and updates the legacy ratio key", async () => {
    const values = installChromeStorage();

    await saveCollapsedLauncherPositionPreference({ side: "left", yRatio: 1.5 });

    expect(values[collapsedLauncherPositionStorageKey]).toEqual({
      side: "left",
      yRatio: 1,
    });
    expect(values[collapsedIconRatioStorageKey]).toBe(1);
  });
});

describe("Rail theme preferences", () => {
  it("falls back to the light theme when stored value is missing or invalid", async () => {
    installChromeStorage();

    await expect(loadRailThemePreference()).resolves.toBe(defaultRailTheme);

    installChromeStorage({
      [railThemeStorageKey]: "sepia",
    });

    await expect(loadRailThemePreference()).resolves.toBe(defaultRailTheme);
  });

  it("loads and saves the dark theme", async () => {
    const values = installChromeStorage({
      [railThemeStorageKey]: "dark",
    });

    await expect(loadRailThemePreference()).resolves.toBe("dark");

    await saveRailThemePreference("light");

    expect(values[railThemeStorageKey]).toBe("light");
  });
});
