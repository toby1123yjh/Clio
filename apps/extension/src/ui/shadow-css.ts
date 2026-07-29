const clioRootFontSizePx = 16;
const cssRemUnitPattern = /(-?(?:\d+(?:\.\d*)?|\.\d+))rem\b/g;

export function normalizeShadowCssRemUnits(css: string) {
  return css.replace(cssRemUnitPattern, (_match, rawValue: string) => {
    const pixels = Number(rawValue) * clioRootFontSizePx;
    return `${formatCssNumber(pixels)}px`;
  });
}

function formatCssNumber(value: number) {
  if (Object.is(value, -0) || Math.abs(value) < 0.0001) return "0";
  return Number(value.toFixed(4)).toString();
}
