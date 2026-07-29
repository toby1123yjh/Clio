import { describe, expect, it } from "vitest";
import { normalizeShadowCssRemUnits } from "./shadow-css";

describe("normalizeShadowCssRemUnits", () => {
  it("pins rem-based extension dimensions to a 16px root", () => {
    expect(
      normalizeShadowCssRemUnits(
        ".toolbar{height:2.25rem;padding:.25rem;transform:translateX(-1.125rem)}",
      ),
    ).toBe(".toolbar{height:36px;padding:4px;transform:translateX(-18px)}");
  });

  it("leaves px, em, percentages, and ordinary text unchanged", () => {
    const css = '.icon{width:14px;height:1em;left:50%;content:"premium"}';
    expect(normalizeShadowCssRemUnits(css)).toBe(css);
  });

  it("normalizes zero without emitting negative zero", () => {
    expect(normalizeShadowCssRemUnits(".reset{inset:-0rem 0rem}")).toBe(".reset{inset:0px 0px}");
  });
});
