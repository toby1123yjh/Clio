const sensitiveTokenSet = new Set([
  "account",
  "auth",
  "bank",
  "billing",
  "checkout",
  "clinic",
  "gmail",
  "health",
  "id",
  "inbox",
  "login",
  "mail",
  "medical",
  "outlook",
  "patient",
  "paypal",
  "stripe",
]);

export function isSensitiveUrlForRelatedCards(input: string) {
  const url = parseUrl(input);
  if (url === null) return false;

  const hostname = url.hostname.toLowerCase();
  if (isLocalOrPrivateHost(hostname)) return true;

  const tokens = tokenizeUrlForSensitivity(url);
  return tokens.some((token) => sensitiveTokenSet.has(token));
}

function parseUrl(input: string) {
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

function tokenizeUrlForSensitivity(url: URL) {
  const queryKeys = Array.from(url.searchParams.keys()).join(" ");
  return `${url.hostname} ${url.pathname} ${queryKeys}`
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length > 0);
}

function isLocalOrPrivateHost(hostname: string) {
  const host = hostname.replace(/^\[/, "").replace(/\]$/, "");
  const normalizedHost = host.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true;
  }
  if (normalizedHost === "::1" || (host.includes(":") && /^f[cd]/.test(normalizedHost))) {
    return true;
  }
  return isPrivateIpv4(host);
}

function isPrivateIpv4(host: string) {
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  const octets = parts.map((part) => Number(part));
  if (octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const first = octets[0];
  const second = octets[1];
  if (first === 10 || first === 127) return true;
  if (first === 172 && second !== undefined && second >= 16 && second <= 31) return true;
  if (first === 192 && second === 168) return true;
  if (first === 169 && second === 254) return true;
  return false;
}
