import { describe, expect, it } from "vitest";
import { isSensitiveUrlForRelatedCards } from "./privacy";

describe("related card privacy helpers", () => {
  it("classifies finance and payment URLs as sensitive", () => {
    expect(isSensitiveUrlForRelatedCards("https://secure.bank.example/dashboard")).toBe(true);
    expect(isSensitiveUrlForRelatedCards("https://www.paypal.com/activity")).toBe(true);
    expect(isSensitiveUrlForRelatedCards("https://shop.example.com/checkout")).toBe(true);
    expect(isSensitiveUrlForRelatedCards("https://billing.example.com/invoices")).toBe(true);
  });

  it("classifies mail and messaging URLs as sensitive", () => {
    expect(isSensitiveUrlForRelatedCards("https://mail.google.com/mail/u/0/#inbox")).toBe(true);
    expect(isSensitiveUrlForRelatedCards("https://outlook.live.com/mail/0/")).toBe(true);
    expect(isSensitiveUrlForRelatedCards("https://example.com/inbox/messages")).toBe(true);
  });

  it("classifies health and clinic URLs as sensitive", () => {
    expect(isSensitiveUrlForRelatedCards("https://health.example.com/results")).toBe(true);
    expect(isSensitiveUrlForRelatedCards("https://clinic.example.com/patient/123")).toBe(true);
    expect(isSensitiveUrlForRelatedCards("https://example.com/medical/records")).toBe(true);
  });

  it("classifies account and identity URLs as sensitive", () => {
    expect(isSensitiveUrlForRelatedCards("https://accounts.example.com/login")).toBe(true);
    expect(isSensitiveUrlForRelatedCards("https://example.com/auth/callback")).toBe(true);
    expect(isSensitiveUrlForRelatedCards("https://example.com/profile?id=123")).toBe(true);
  });

  it("classifies local and private network URLs as sensitive", () => {
    expect(isSensitiveUrlForRelatedCards("http://localhost:5173")).toBe(true);
    expect(isSensitiveUrlForRelatedCards("https://devbox.local/page")).toBe(true);
    expect(isSensitiveUrlForRelatedCards("https://api.internal/status")).toBe(true);
    expect(isSensitiveUrlForRelatedCards("http://10.0.0.5/page")).toBe(true);
    expect(isSensitiveUrlForRelatedCards("http://172.20.1.2/page")).toBe(true);
    expect(isSensitiveUrlForRelatedCards("http://192.168.1.10/page")).toBe(true);
    expect(isSensitiveUrlForRelatedCards("http://[::1]/page")).toBe(true);
    expect(isSensitiveUrlForRelatedCards("http://[fd00::1]/page")).toBe(true);
  });

  it("does not classify ordinary public article URLs as sensitive", () => {
    expect(isSensitiveUrlForRelatedCards("https://example.com/articles/browser-memory")).toBe(
      false,
    );
  });
});
