process.env.CLIO_POC_LOCAL_EMBEDDING = "1";
process.env.CLIO_POC_LOCAL_EMBEDDING_MODEL = process.argv[2] ?? "all";
await import("./chrome-extension-smoke.mjs");
