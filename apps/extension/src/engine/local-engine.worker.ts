import { buildMemoryVersionGroupKey } from "@/src/shared/reliability";
import {
  type AnchorInfo,
  type AnchorResolveResult,
  type AppendSessionEvidencePayload,
  CLIO_WORKER_RESPONSE,
  type CaptureBasePayload,
  type CaptureResult,
  type CaptureSelectionPayload,
  type ChatMessageRecord,
  type ChatMessageRole,
  type ChatMessageStatus,
  type ChatSessionDetail,
  type ChatSessionSummary,
  type CompactionRecord,
  type CreateChatSessionPayload,
  type CreateCompactionPayload,
  type DeleteMemoryResult,
  type EngineHealth,
  type EngineRequest,
  EngineRpcError,
  type GetJobStatusResult,
  type ImageGenerationHistoryRecord,
  type JobStatus,
  type JobSummary,
  type JobType,
  type ListMemoriesResult,
  type MemoryDetail,
  type MemorySummary,
  type ReindexResult,
  type RepairAction,
  type RepairResult,
  type SearchMemoryResult,
  type SessionEvidenceRecord,
  type SessionLeaseResult,
  type SourceKind,
  type UpdateChatMessagePayload,
  type UpsertChatMessagePayload,
  type WebSearchHistoryRecord,
  engineErrorFromUnknown,
  isWorkerRequestMessage,
} from "@/src/shared/rpc";
import {
  buildFtsQuery,
  chunkText,
  excerpt,
  expandChineseBigrams,
  hashText,
  normalizeSourceUrl,
  normalizeText,
} from "@/src/shared/text";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import sqliteWasmUrl from "@sqlite.org/sqlite-wasm/sqlite3.wasm?url";
import { compareChatMessagesForDisplay } from "./chat-message-order";

type SqlValue = string | number | bigint | null | Uint8Array;
type SqlRow = Record<string, SqlValue>;
type SqliteDb = {
  filename: string;
  exec: (options: string | { sql: string; bind?: unknown[] }) => void;
  selectValue: (sql: string, bind?: unknown[]) => SqlValue | undefined;
  selectObject: (sql: string, bind?: unknown[]) => SqlRow | undefined;
  selectObjects: (sql: string, bind?: unknown[]) => SqlRow[];
  close: () => void;
};
type SqliteApi = {
  oo1: {
    DB: new (filename: string, flags?: string) => SqliteDb;
    OpfsDb?: new (filename: string, flags?: string) => SqliteDb;
  };
  version: {
    libVersion: string;
  };
  opfs?: unknown;
};
type SqliteInitModule = (config?: {
  locateFile?: (path: string) => string;
}) => Promise<SqliteApi>;

const databasePath = "/clio-browser-phase1.sqlite3";
const schemaVersion = 7;
const staleJobMs = 60_000;
const defaultJobMaxAttempts = 3;
const staleSessionLeaseMs = 30_000;

class LocalEngine {
  private db: SqliteDb | null = null;
  private healthState: EngineHealth = startingHealth();

  async handle(request: EngineRequest) {
    switch (request.kind) {
      case "health":
        return await this.health();
      case "capturePage":
        return await this.capture("page", request.payload);
      case "captureSelection":
        return await this.capture("selection", request.payload);
      case "searchMemory":
        return await this.search(request.query, request.limit);
      case "listMemories":
        return await this.list(request.limit);
      case "getMemory":
        return await this.get(request.id);
      case "deleteMemory":
        return await this.delete(request.id);
      case "repair":
        return await this.repair(request.action);
      case "getJobStatus":
        return await this.getJobStatus(request.status, request.limit);
      case "reindex":
        return await this.reindex(request.scope);
      case "resolveAnchor":
        return await this.resolveAnchor(request.memoryId);
      case "createChatSession":
        return await this.createChatSession(request.payload);
      case "listChatSessions":
        return await this.listChatSessions(request.limit);
      case "loadChatSession":
        return await this.loadChatSession(request.sessionId);
      case "claimChatSession":
        return await this.claimChatSession(request.sessionId, request.ownerId, request.now);
      case "heartbeatChatSession":
        return await this.heartbeatChatSession(request.sessionId, request.ownerId, request.now);
      case "releaseChatSession":
        return await this.releaseChatSession(request.sessionId, request.ownerId);
      case "appendSessionEvidence":
        return await this.appendSessionEvidence(request.payload);
      case "appendCompaction":
        return await this.appendCompaction(request.payload);
      case "listCompactions":
        return await this.listCompactions(request.sessionId, request.limit);
      case "getLatestCompaction":
        return await this.getLatestCompaction(request.sessionId);
      case "upsertChatMessage":
        return await this.upsertChatMessage(request.payload);
      case "updateChatMessage":
        return await this.updateChatMessage(request.payload);
      case "deleteChatMessage":
        return await this.deleteChatMessage(request.sessionId, request.messageId);
      case "clearQueuedChatMessages":
        return await this.clearQueuedChatMessages(request.sessionId);
      case "recoverInterruptedChatSession":
        return await this.recoverInterruptedChatSession(request.sessionId);
      case "listWebSearchHistory":
        return await this.listWebSearchHistory(request.limit);
      case "appendWebSearchHistory":
        return await this.appendWebSearchHistory(request.payload);
      case "deleteWebSearchHistory":
        return await this.deleteWebSearchHistory(request.id);
      case "clearWebSearchHistory":
        return await this.clearWebSearchHistory();
      case "listImageGenerationHistory":
        return await this.listImageGenerationHistory(request.limit);
      case "appendImageGenerationHistory":
        return await this.appendImageGenerationHistory(request.payload);
      case "deleteImageGenerationHistory":
        return await this.deleteImageGenerationHistory(request.id);
      default:
        return assertNever(request);
    }
  }

  private async health(): Promise<EngineHealth> {
    if (this.db === null && this.healthState.status !== "error") {
      try {
        await this.ensureReady();
      } catch {
        return this.healthState;
      }
    }
    return this.healthState;
  }

  private async capture(kind: SourceKind, payload: CaptureBasePayload): Promise<CaptureResult> {
    const db = await this.ensureReady();
    const normalizedText = normalizeText(payload.normalizedText);
    if (normalizedText.length === 0) {
      throw new EngineRpcError("EMPTY_CAPTURE", "Nothing readable was found to save.");
    }

    const sourceUrl = payload.sourceUrl.trim();
    const normalizedSourceUrl = normalizeSourceUrl(sourceUrl);
    const sourceTitle = payload.sourceTitle.trim() || fallbackTitle(sourceUrl);
    const textHash = hashText(normalizedText);
    const existing = db.selectObject(
      `SELECT *
       FROM memories
       WHERE source_kind = ? AND normalized_source_url = ? AND text_hash = ?
       LIMIT 1`,
      [kind, normalizedSourceUrl, textHash],
    );
    if (existing !== undefined) {
      return {
        status: "duplicate",
        memory: memorySummaryFromRow(existing),
      };
    }

    const chunks = chunkText(normalizedText);
    if (chunks.length === 0) {
      throw new EngineRpcError("EMPTY_CAPTURE", "Nothing readable was found to save.");
    }

    const memoryId = createId("mem");
    const capturedAt = payload.capturedAt ?? new Date().toISOString();
    const metadataJson = JSON.stringify(payload.metadata ?? {});
    const versionGroupKey = buildMemoryVersionGroupKey(kind, normalizedSourceUrl, textHash);
    const previousVersion =
      kind === "page" ? findCurrentPageVersion(db, versionGroupKey) : undefined;
    const versionNo =
      previousVersion === undefined
        ? 1
        : Math.max(1, numberField(previousVersion, "version_no")) + 1;
    const supersedesMemoryId =
      previousVersion === undefined ? undefined : stringField(previousVersion, "id");

    transaction(db, () => {
      if (kind === "page" && supersedesMemoryId !== undefined) {
        db.exec({
          sql: `UPDATE memories
                SET is_current = 0,
                    superseded_by_memory_id = ?
                WHERE id = ?`,
          bind: [memoryId, supersedesMemoryId],
        });
      }

      db.exec({
        sql: `INSERT INTO memories (
          id,
          source_kind,
          source_url,
          normalized_source_url,
          source_title,
          captured_at,
          normalized_text,
          text_hash,
          metadata_json,
          version_group_key,
          version_no,
          supersedes_memory_id,
          superseded_by_memory_id,
          is_current,
          simhash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, NULL)`,
        bind: [
          memoryId,
          kind,
          sourceUrl,
          normalizedSourceUrl,
          sourceTitle,
          capturedAt,
          normalizedText,
          textHash,
          metadataJson,
          versionGroupKey,
          versionNo,
          supersedesMemoryId ?? null,
        ],
      });

      for (const chunk of chunks) {
        const chunkId = `${memoryId}:${chunk.ord}`;
        db.exec({
          sql: `INSERT INTO chunks (
            id,
            memory_id,
            ord,
            text,
            token_count,
            hash,
            fts_text
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          bind: [
            chunkId,
            memoryId,
            chunk.ord,
            chunk.text,
            chunk.tokenCount,
            chunk.hash,
            expandChineseBigrams(chunk.text),
          ],
        });
        insertFtsRow(db, {
          memoryId,
          chunkId,
          sourceKind: kind,
          title: sourceTitle,
          text: chunk.text,
        });
      }

      if (kind === "selection") {
        insertAnchor(db, memoryId, payload as CaptureSelectionPayload, normalizedText, capturedAt);
      }
    });

    const saved = db.selectObject("SELECT * FROM memories WHERE id = ? LIMIT 1", [memoryId]);
    return {
      status: "saved",
      memory:
        saved === undefined
          ? {
              id: memoryId,
              sourceKind: kind,
              sourceUrl,
              sourceTitle,
              capturedAt,
              excerpt: excerpt(normalizedText),
              version: {
                groupKey: versionGroupKey,
                versionNo,
                isCurrent: true,
                supersedesMemoryId,
              },
            }
          : memorySummaryFromRow(saved),
    };
  }

  private async search(query: string, limit = 30): Promise<SearchMemoryResult> {
    const db = await this.ensureReady();
    const normalizedQuery = normalizeText(query);
    const ftsQuery = buildFtsQuery(normalizedQuery);
    if (ftsQuery.length === 0) {
      return this.list(Math.min(limit, 50)).then((result) => ({
        items: result.items.map((item) => ({ ...item, snippet: item.excerpt })),
        query: normalizedQuery,
      }));
    }

    const rows = db.selectObjects(
      `SELECT
        m.id,
        m.source_kind,
        m.source_url,
        m.normalized_source_url,
        m.source_title,
        m.captured_at,
        m.normalized_text,
        m.version_group_key,
        m.version_no,
        m.supersedes_memory_id,
        m.superseded_by_memory_id,
        m.is_current,
        c.text AS chunk_text,
        bm25(memory_fts) AS score
       FROM memory_fts
       JOIN memories m ON m.id = memory_fts.memory_id
       JOIN chunks c ON c.id = memory_fts.chunk_id
       WHERE memory_fts MATCH ?
       ORDER BY score ASC
       LIMIT ?`,
      [ftsQuery, clampLimit(limit, 80)],
    );

    const seen = new Set<string>();
    const items = rows.flatMap((row) => {
      const id = stringField(row, "id");
      if (seen.has(id)) return [];
      seen.add(id);
      return [
        {
          ...memorySummaryFromRow(row),
          snippet: excerpt(stringField(row, "chunk_text") || stringField(row, "normalized_text")),
        },
      ];
    });

    return {
      items,
      query: normalizedQuery,
    };
  }

  private async list(limit = 30): Promise<ListMemoriesResult> {
    const db = await this.ensureReady();
    const rows = db.selectObjects(
      `SELECT *
       FROM memories
       ORDER BY captured_at DESC
       LIMIT ?`,
      [clampLimit(limit, 100)],
    );
    return {
      items: rows.map(memorySummaryFromRow),
    };
  }

  private async get(id: string): Promise<MemoryDetail | null> {
    const db = await this.ensureReady();
    const row = db.selectObject("SELECT * FROM memories WHERE id = ? LIMIT 1", [id]);
    if (row === undefined) return null;
    const chunkRows = db.selectObjects(
      `SELECT id, ord, text, token_count
       FROM chunks
       WHERE memory_id = ?
       ORDER BY ord ASC`,
      [id],
    );
    const anchor = db.selectObject("SELECT * FROM anchors WHERE memory_id = ? LIMIT 1", [id]);

    return {
      ...memorySummaryFromRow(row),
      normalizedText: stringField(row, "normalized_text"),
      metadata: parseMetadata(stringField(row, "metadata_json")),
      anchor: anchor === undefined ? undefined : anchorFromRow(anchor),
      chunks: chunkRows.map((chunk) => ({
        id: stringField(chunk, "id"),
        ord: numberField(chunk, "ord"),
        text: stringField(chunk, "text"),
        tokenCount: numberField(chunk, "token_count"),
      })),
    };
  }

  private async delete(id: string): Promise<DeleteMemoryResult> {
    const db = await this.ensureReady();
    transaction(db, () => {
      db.exec({
        sql: `UPDATE memories
              SET superseded_by_memory_id = NULL
              WHERE superseded_by_memory_id = ?`,
        bind: [id],
      });
      db.exec({
        sql: `UPDATE memories
              SET supersedes_memory_id = NULL
              WHERE supersedes_memory_id = ?`,
        bind: [id],
      });
      db.exec({ sql: "DELETE FROM anchors WHERE memory_id = ?", bind: [id] });
      db.exec({ sql: "DELETE FROM memory_fts WHERE memory_id = ?", bind: [id] });
      db.exec({ sql: "DELETE FROM chunks WHERE memory_id = ?", bind: [id] });
      db.exec({ sql: "DELETE FROM memories WHERE id = ?", bind: [id] });
    });
    return {
      deleted: db.selectValue("SELECT changes()") !== 0,
      id,
    };
  }

  private async repair(action: RepairAction): Promise<RepairResult> {
    switch (action) {
      case "retry_init":
        this.close();
        this.healthState = startingHealth();
        await this.ensureReady();
        return { action, health: this.healthState };
      case "rebuild_fts":
        await this.rebuildFts();
        return { action, health: this.healthState };
      case "reset_library":
        await this.resetLibrary();
        return { action, health: this.healthState };
      default:
        return assertNever(action);
    }
  }

  private async getJobStatus(status?: JobStatus, limit = 30): Promise<GetJobStatusResult> {
    const db = await this.ensureReady();
    const clampedLimit = clampLimit(limit, 100);
    const rows =
      status === undefined
        ? db.selectObjects(
            `SELECT *
             FROM jobs
             ORDER BY created_at DESC
             LIMIT ?`,
            [clampedLimit],
          )
        : db.selectObjects(
            `SELECT *
             FROM jobs
             WHERE status = ?
             ORDER BY created_at DESC
             LIMIT ?`,
            [status, clampedLimit],
          );
    return {
      jobs: rows.map(jobSummaryFromRow),
    };
  }

  private async reindex(scope: "fts"): Promise<ReindexResult> {
    if (scope !== "fts") {
      throw new EngineRpcError("UNSUPPORTED_REINDEX_SCOPE", `Unsupported reindex scope: ${scope}`);
    }
    const db = await this.ensureReady();
    const jobId = enqueueJob(db, "reindex_fts", { scope });
    const job = runJob(db, jobId);
    return {
      jobId,
      status: job.status,
    };
  }

  private async resolveAnchor(memoryId: string): Promise<AnchorResolveResult> {
    const db = await this.ensureReady();
    const memory = db.selectObject("SELECT * FROM memories WHERE id = ? LIMIT 1", [memoryId]);
    if (memory === undefined) {
      return { status: "missing_memory", memoryId };
    }
    const anchor = db.selectObject("SELECT * FROM anchors WHERE memory_id = ? LIMIT 1", [memoryId]);
    if (anchor === undefined) {
      return {
        status: "missing_anchor",
        memoryId,
        sourceUrl: stringField(memory, "source_url"),
        sourceTitle: stringField(memory, "source_title"),
        sourceKind: sourceKindField(memory, "source_kind"),
      };
    }

    const resolvedAt = new Date().toISOString();
    db.exec({
      sql: `UPDATE anchors
            SET last_resolved_at = ?,
                last_resolution_status = 'returned'
            WHERE id = ?`,
      bind: [resolvedAt, stringField(anchor, "id")],
    });

    return {
      status: "resolved",
      memoryId,
      sourceUrl: stringField(memory, "source_url"),
      sourceTitle: stringField(memory, "source_title"),
      sourceKind: sourceKindField(memory, "source_kind"),
      anchor: {
        ...anchorFromRow(anchor),
        lastResolutionStatus: "returned",
      },
    };
  }

  private async createChatSession(payload: CreateChatSessionPayload): Promise<ChatSessionSummary> {
    const db = await this.ensureReady();
    const now = payload.createdAt ?? new Date().toISOString();
    const sessionId = payload.id ?? createId("sess");
    const title = normalizeSessionTitle(payload.title);
    const pageUrl = payload.pageUrl?.trim() || null;
    const pageTitle = payload.pageTitle?.trim() || null;
    const normalizedPageUrl = pageUrl === null ? null : normalizeSourceUrl(pageUrl);

    db.exec({
      sql: `INSERT INTO sessions (
        id,
        title,
        source_page_url,
        source_page_title,
        normalized_page_url,
        initial_scope,
        current_evidence_revision,
        message_count,
        last_message_excerpt,
        owner_id,
        owner_heartbeat_at,
        metadata_json,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, '', ?, ?, ?, ?, ?)`,
      bind: [
        sessionId,
        title,
        pageUrl,
        pageTitle,
        normalizedPageUrl,
        payload.initialScope ?? null,
        payload.ownerId ?? null,
        payload.ownerId === undefined ? null : now,
        JSON.stringify(payload.metadata ?? {}),
        now,
        now,
      ],
    });

    const row = db.selectObject("SELECT * FROM sessions WHERE id = ? LIMIT 1", [sessionId]);
    if (row === undefined) {
      throw new EngineRpcError("SESSION_CREATE_FAILED", "Chat session was not created.");
    }
    return chatSessionSummaryFromRow(row);
  }

  private async listChatSessions(limit = 30): Promise<{ items: ChatSessionSummary[] }> {
    const db = await this.ensureReady();
    const rows = db.selectObjects(
      `SELECT *
       FROM sessions
       ORDER BY updated_at DESC
       LIMIT ?`,
      [clampLimit(limit, 30)],
    );
    return {
      items: rows.map(chatSessionSummaryFromRow),
    };
  }

  private async loadChatSession(sessionId: string): Promise<ChatSessionDetail | null> {
    const db = await this.ensureReady();
    return loadChatSessionDetail(db, sessionId);
  }

  private async claimChatSession(
    sessionId: string,
    ownerId: string,
    nowInput?: string,
  ): Promise<SessionLeaseResult> {
    const db = await this.ensureReady();
    const row = db.selectObject("SELECT * FROM sessions WHERE id = ? LIMIT 1", [sessionId]);
    if (row === undefined) return { status: "missing" };

    const existingOwnerId = optionalString(row, "owner_id");
    const heartbeatAt = optionalString(row, "owner_heartbeat_at");
    const now = nowInput ?? new Date().toISOString();
    if (
      existingOwnerId !== undefined &&
      existingOwnerId !== ownerId &&
      heartbeatAt !== undefined &&
      !isStaleSessionLease(heartbeatAt)
    ) {
      return {
        status: "already_open",
        session: chatSessionSummaryFromRow(row),
        ownerId: existingOwnerId,
        ownerHeartbeatAt: heartbeatAt,
      };
    }

    db.exec({
      sql: `UPDATE sessions
            SET owner_id = ?,
                owner_heartbeat_at = ?
            WHERE id = ?`,
      bind: [ownerId, now, sessionId],
    });
    const updated = db.selectObject("SELECT * FROM sessions WHERE id = ? LIMIT 1", [sessionId]);
    return {
      status: "claimed",
      session:
        updated === undefined ? chatSessionSummaryFromRow(row) : chatSessionSummaryFromRow(updated),
    };
  }

  private async heartbeatChatSession(
    sessionId: string,
    ownerId: string,
    nowInput?: string,
  ): Promise<SessionLeaseResult> {
    const db = await this.ensureReady();
    const row = db.selectObject("SELECT * FROM sessions WHERE id = ? LIMIT 1", [sessionId]);
    if (row === undefined) return { status: "missing" };
    const existingOwnerId = optionalString(row, "owner_id");
    const heartbeatAt = optionalString(row, "owner_heartbeat_at");
    if (
      existingOwnerId !== undefined &&
      existingOwnerId !== ownerId &&
      heartbeatAt !== undefined &&
      !isStaleSessionLease(heartbeatAt)
    ) {
      return {
        status: "already_open",
        session: chatSessionSummaryFromRow(row),
        ownerId: existingOwnerId,
        ownerHeartbeatAt: heartbeatAt,
      };
    }

    const now = nowInput ?? new Date().toISOString();
    db.exec({
      sql: `UPDATE sessions
            SET owner_id = ?,
                owner_heartbeat_at = ?
            WHERE id = ?`,
      bind: [ownerId, now, sessionId],
    });
    const updated = db.selectObject("SELECT * FROM sessions WHERE id = ? LIMIT 1", [sessionId]);
    return {
      status: "claimed",
      session:
        updated === undefined ? chatSessionSummaryFromRow(row) : chatSessionSummaryFromRow(updated),
    };
  }

  private async releaseChatSession(
    sessionId: string,
    ownerId: string,
  ): Promise<SessionLeaseResult> {
    const db = await this.ensureReady();
    const row = db.selectObject("SELECT * FROM sessions WHERE id = ? LIMIT 1", [sessionId]);
    if (row === undefined) return { status: "missing" };
    if (optionalString(row, "owner_id") !== ownerId) {
      return {
        status: "already_open",
        session: chatSessionSummaryFromRow(row),
        ownerId: optionalString(row, "owner_id"),
        ownerHeartbeatAt: optionalString(row, "owner_heartbeat_at"),
      };
    }
    db.exec({
      sql: `UPDATE sessions
            SET owner_id = NULL,
                owner_heartbeat_at = NULL
            WHERE id = ?`,
      bind: [sessionId],
    });
    const updated = db.selectObject("SELECT * FROM sessions WHERE id = ? LIMIT 1", [sessionId]);
    return {
      status: "claimed",
      session:
        updated === undefined ? chatSessionSummaryFromRow(row) : chatSessionSummaryFromRow(updated),
    };
  }

  private async appendSessionEvidence(
    payload: AppendSessionEvidencePayload,
  ): Promise<SessionEvidenceRecord> {
    const db = await this.ensureReady();
    const session = db.selectObject("SELECT * FROM sessions WHERE id = ? LIMIT 1", [
      payload.sessionId,
    ]);
    if (session === undefined) {
      throw new EngineRpcError("SESSION_NOT_FOUND", `Chat session not found: ${payload.sessionId}`);
    }

    const now = payload.createdAt ?? new Date().toISOString();
    const evidenceId = payload.id ?? createId("ev");
    let revision = 1;
    transaction(db, () => {
      const currentRevision = db.selectValue(
        "SELECT COALESCE(MAX(revision), 0) FROM session_evidence WHERE session_id = ?",
        [payload.sessionId],
      );
      revision =
        typeof currentRevision === "number" ? currentRevision + 1 : Number(currentRevision) + 1;
      const metadata = {
        ...(payload.metadata ?? {}),
        ...(payload.evidence.anchor === undefined ? {} : { anchor: payload.evidence.anchor }),
      };
      db.exec({
        sql: `INSERT INTO session_evidence (
          id,
          session_id,
          revision,
          source_kind,
          page_url,
          page_title,
          text,
          excerpt,
          metadata_json,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        bind: [
          evidenceId,
          payload.sessionId,
          revision,
          payload.evidence.sourceKind,
          payload.evidence.sourceUrl,
          payload.evidence.sourceTitle,
          payload.evidence.text,
          payload.evidence.excerpt,
          JSON.stringify(metadata),
          now,
        ],
      });
      db.exec({
        sql: `UPDATE sessions
              SET current_evidence_revision = ?,
                  updated_at = ?
              WHERE id = ?`,
        bind: [revision, now, payload.sessionId],
      });
    });

    const row = db.selectObject("SELECT * FROM session_evidence WHERE id = ? LIMIT 1", [
      evidenceId,
    ]);
    if (row === undefined) {
      throw new EngineRpcError("EVIDENCE_CREATE_FAILED", "Session evidence was not created.");
    }
    return sessionEvidenceFromRow(row);
  }

  private async appendCompaction(payload: CreateCompactionPayload): Promise<CompactionRecord> {
    const db = await this.ensureReady();
    const session = db.selectObject("SELECT * FROM sessions WHERE id = ? LIMIT 1", [
      payload.sessionId,
    ]);
    if (session === undefined) {
      throw new EngineRpcError("SESSION_NOT_FOUND", `Chat session not found: ${payload.sessionId}`);
    }

    const previousCompactionId =
      payload.previousCompactionId === undefined ? null : payload.previousCompactionId;
    if (previousCompactionId !== null) {
      const previous = db.selectObject(
        "SELECT id FROM compactions WHERE id = ? AND session_id = ? LIMIT 1",
        [previousCompactionId, payload.sessionId],
      );
      if (previous === undefined) {
        throw new EngineRpcError(
          "COMPACTION_PREVIOUS_NOT_FOUND",
          `Previous compaction not found: ${previousCompactionId}`,
        );
      }
    }

    const compactionId = payload.id ?? createId("cmp");
    const createdAt = payload.createdAt ?? new Date().toISOString();
    db.exec({
      sql: `INSERT INTO compactions (
        id,
        session_id,
        summary,
        first_kept_message_id,
        evidence_summary,
        first_kept_evidence_id,
        first_kept_evidence_revision,
        previous_compaction_id,
        covered_evidence_json,
        tokens_before,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      bind: [
        compactionId,
        payload.sessionId,
        payload.summary,
        payload.firstKeptMessageId,
        payload.evidenceSummary,
        payload.firstKeptEvidenceId ?? null,
        payload.firstKeptEvidenceRevision ?? null,
        previousCompactionId,
        JSON.stringify(payload.coveredEvidence ?? []),
        payload.tokensBefore,
        createdAt,
      ],
    });

    const row = db.selectObject("SELECT * FROM compactions WHERE id = ? LIMIT 1", [compactionId]);
    if (row === undefined) {
      throw new EngineRpcError("COMPACTION_CREATE_FAILED", "Compaction record was not created.");
    }
    return compactionRecordFromRow(row);
  }

  private async listCompactions(
    sessionId: string,
    limit = 30,
  ): Promise<{ items: CompactionRecord[] }> {
    const db = await this.ensureReady();
    const rows = db.selectObjects(
      `SELECT *
       FROM compactions
       WHERE session_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
      [sessionId, clampLimit(limit, 30)],
    );
    return {
      items: rows.map(compactionRecordFromRow),
    };
  }

  private async getLatestCompaction(sessionId: string): Promise<CompactionRecord | null> {
    const db = await this.ensureReady();
    const row = db.selectObject(
      `SELECT *
       FROM compactions
       WHERE session_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [sessionId],
    );
    return row === undefined ? null : compactionRecordFromRow(row);
  }

  private async upsertChatMessage(payload: UpsertChatMessagePayload): Promise<ChatMessageRecord> {
    const db = await this.ensureReady();
    const session = db.selectObject("SELECT * FROM sessions WHERE id = ? LIMIT 1", [
      payload.sessionId,
    ]);
    if (session === undefined) {
      throw new EngineRpcError("SESSION_NOT_FOUND", `Chat session not found: ${payload.sessionId}`);
    }

    const now = payload.updatedAt ?? payload.createdAt ?? new Date().toISOString();
    const createdAt = payload.createdAt ?? now;
    const piAgentMessageJson = payload.piAgentMessageJson ?? defaultPiAgentMessageJson(payload);
    transaction(db, () => {
      db.exec({
        sql: `INSERT INTO messages (
          id,
          session_id,
          role,
          status,
          content,
          scope,
          page_url,
          page_title,
          selection_text,
          citations_json,
          world_knowledge_json,
          evidence_refs_json,
          error_json,
          retry_json,
          pi_agent_message_json,
          run_id,
          queue_order,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          content = excluded.content,
          page_url = excluded.page_url,
          page_title = excluded.page_title,
          selection_text = excluded.selection_text,
          citations_json = excluded.citations_json,
          world_knowledge_json = excluded.world_knowledge_json,
          evidence_refs_json = excluded.evidence_refs_json,
          error_json = excluded.error_json,
          retry_json = excluded.retry_json,
          pi_agent_message_json = excluded.pi_agent_message_json,
          run_id = excluded.run_id,
          queue_order = excluded.queue_order,
          updated_at = excluded.updated_at`,
        bind: [
          payload.id,
          payload.sessionId,
          payload.role,
          payload.status,
          payload.content,
          payload.scope,
          payload.pageUrl ?? null,
          payload.pageTitle ?? null,
          payload.selectionText ?? null,
          JSON.stringify(payload.citations ?? []),
          JSON.stringify(payload.worldKnowledge ?? []),
          JSON.stringify(payload.evidenceRefs ?? []),
          JSON.stringify(payload.error ?? null),
          JSON.stringify(payload.retry ?? null),
          JSON.stringify(piAgentMessageJson),
          payload.runId ?? null,
          payload.queueOrder ?? null,
          createdAt,
          now,
        ],
      });
      refreshSessionStats(db, payload.sessionId, now);
    });

    const row = db.selectObject("SELECT * FROM messages WHERE id = ? LIMIT 1", [payload.id]);
    if (row === undefined) {
      throw new EngineRpcError("MESSAGE_UPSERT_FAILED", "Chat message was not saved.");
    }
    return chatMessageRecordFromRow(row);
  }

  private async updateChatMessage(payload: UpdateChatMessagePayload): Promise<ChatMessageRecord> {
    const db = await this.ensureReady();
    const row = db.selectObject("SELECT * FROM messages WHERE id = ? AND session_id = ? LIMIT 1", [
      payload.id,
      payload.sessionId,
    ]);
    if (row === undefined) {
      throw new EngineRpcError("MESSAGE_NOT_FOUND", `Chat message not found: ${payload.id}`);
    }
    const existing = chatMessageRecordFromRow(row);
    const error = payload.clearError === true ? undefined : (payload.error ?? existing.error);
    const retry = payload.clearRetry === true ? undefined : (payload.retry ?? existing.retry);
    const piAgentMessageJson = payload.piAgentMessageJson ?? existing.piAgentMessageJson;
    const runId = payload.runId ?? existing.runId;
    const queueOrder = payload.queueOrder ?? existing.queueOrder;
    const merged: UpsertChatMessagePayload = {
      id: existing.id,
      sessionId: existing.sessionId,
      role: existing.role,
      status: payload.status ?? existing.status,
      content:
        payload.content ??
        (payload.appendContent === undefined
          ? existing.content
          : `${existing.content}${payload.appendContent}`),
      scope: existing.scope,
      createdAt: existing.createdAt,
      updatedAt: payload.updatedAt ?? new Date().toISOString(),
      ...(existing.pageUrl === undefined ? {} : { pageUrl: existing.pageUrl }),
      ...(existing.pageTitle === undefined ? {} : { pageTitle: existing.pageTitle }),
      ...(existing.selectionText === undefined ? {} : { selectionText: existing.selectionText }),
      citations: payload.citations ?? existing.citations,
      worldKnowledge: payload.worldKnowledge ?? existing.worldKnowledge,
      evidenceRefs: payload.evidenceRefs ?? existing.evidenceRefs,
      ...(error === undefined ? {} : { error }),
      ...(retry === undefined ? {} : { retry }),
      ...(piAgentMessageJson === undefined ? {} : { piAgentMessageJson }),
      ...(runId === undefined ? {} : { runId }),
      ...(queueOrder === undefined ? {} : { queueOrder }),
    };
    return await this.upsertChatMessage(merged);
  }

  private async deleteChatMessage(
    sessionId: string,
    messageId: string,
  ): Promise<{ deleted: boolean }> {
    const db = await this.ensureReady();
    const now = new Date().toISOString();
    let deleted = 0;
    transaction(db, () => {
      db.exec({
        sql: `DELETE FROM messages
              WHERE id = ?
                AND session_id = ?`,
        bind: [messageId, sessionId],
      });
      deleted = Number(db.selectValue("SELECT changes()") ?? 0);
      refreshSessionStats(db, sessionId, now);
    });
    return { deleted: deleted > 0 };
  }

  private async clearQueuedChatMessages(sessionId: string): Promise<{ cleared: number }> {
    const db = await this.ensureReady();
    const now = new Date().toISOString();
    db.exec({
      sql: `UPDATE messages
            SET status = 'cancelled',
                error_json = ?,
                updated_at = ?
            WHERE session_id = ?
              AND status = 'queued'`,
      bind: [
        JSON.stringify({ code: "CANCELLED", message: "Queued message cleared." }),
        now,
        sessionId,
      ],
    });
    const cleared = Number(db.selectValue("SELECT changes()") ?? 0);
    refreshSessionStats(db, sessionId, now);
    return { cleared };
  }

  private async recoverInterruptedChatSession(
    sessionId: string,
  ): Promise<ChatSessionDetail | null> {
    const db = await this.ensureReady();
    const now = new Date().toISOString();
    transaction(db, () => {
      db.exec({
        sql: `UPDATE messages
              SET status = 'interrupted',
                  error_json = ?,
                  updated_at = ?
              WHERE session_id = ?
                AND role = 'assistant'
                AND status = 'streaming'`,
        bind: [
          JSON.stringify({
            code: "PROVIDER_INTERRUPTED",
            message: "Clio lost the active answer. Retry when ready.",
          }),
          now,
          sessionId,
        ],
      });
      refreshSessionStats(db, sessionId, now);
    });
    return loadChatSessionDetail(db, sessionId);
  }

  private async listWebSearchHistory(limit = 10): Promise<{ items: WebSearchHistoryRecord[] }> {
    const db = await this.ensureReady();
    const rows = db.selectObjects(
      `SELECT *
       FROM web_search_history
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
      [clampLimit(limit, 10)],
    );
    return { items: rows.map(webSearchHistoryRecordFromRow) };
  }

  private async appendWebSearchHistory(
    payload: WebSearchHistoryRecord,
  ): Promise<WebSearchHistoryRecord> {
    const db = await this.ensureReady();
    transaction(db, () => {
      db.exec({
        sql: `INSERT INTO web_search_history (
          id,
          query,
          answer,
          sources_json,
          provider,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          query = excluded.query,
          answer = excluded.answer,
          sources_json = excluded.sources_json,
          provider = excluded.provider,
          created_at = excluded.created_at`,
        bind: [
          payload.id,
          payload.query,
          payload.answer,
          JSON.stringify(payload.sources),
          payload.provider,
          payload.createdAt,
        ],
      });
      db.exec(`
        DELETE FROM web_search_history
        WHERE id NOT IN (
          SELECT id
          FROM web_search_history
          ORDER BY created_at DESC, id DESC
          LIMIT 10
        )
      `);
    });

    const row = db.selectObject("SELECT * FROM web_search_history WHERE id = ? LIMIT 1", [
      payload.id,
    ]);
    if (row === undefined) {
      throw new EngineRpcError("WEB_SEARCH_HISTORY_CREATE_FAILED", "Search history was not saved.");
    }
    return webSearchHistoryRecordFromRow(row);
  }

  private async deleteWebSearchHistory(id: string): Promise<{ deleted: boolean }> {
    const db = await this.ensureReady();
    db.exec({
      sql: "DELETE FROM web_search_history WHERE id = ?",
      bind: [id],
    });
    return { deleted: Number(db.selectValue("SELECT changes()") ?? 0) > 0 };
  }

  private async clearWebSearchHistory(): Promise<{ cleared: number }> {
    const db = await this.ensureReady();
    db.exec("DELETE FROM web_search_history");
    return { cleared: Number(db.selectValue("SELECT changes()") ?? 0) };
  }

  private async listImageGenerationHistory(
    limit = 20,
  ): Promise<{ items: ImageGenerationHistoryRecord[] }> {
    const db = await this.ensureReady();
    const rows = db.selectObjects(
      `SELECT *
       FROM image_generation_history
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
      [clampLimit(limit, 20)],
    );
    return { items: rows.map(imageGenerationHistoryRecordFromRow) };
  }

  private async appendImageGenerationHistory(
    payload: ImageGenerationHistoryRecord,
  ): Promise<ImageGenerationHistoryRecord> {
    const db = await this.ensureReady();
    transaction(db, () => {
      db.exec({
        sql: `INSERT INTO image_generation_history (
          id,
          mode,
          prompt,
          model,
          size,
          provider,
          output_mime_type,
          output_data_url,
          output_b64_json,
          input_json,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          mode = excluded.mode,
          prompt = excluded.prompt,
          model = excluded.model,
          size = excluded.size,
          provider = excluded.provider,
          output_mime_type = excluded.output_mime_type,
          output_data_url = excluded.output_data_url,
          output_b64_json = excluded.output_b64_json,
          input_json = excluded.input_json,
          created_at = excluded.created_at`,
        bind: [
          payload.id,
          payload.mode,
          payload.prompt,
          payload.model,
          payload.size,
          payload.provider,
          payload.output.mimeType,
          payload.output.dataUrl,
          payload.output.b64Json,
          JSON.stringify(payload.input ?? null),
          payload.createdAt,
        ],
      });
      db.exec(`
        DELETE FROM image_generation_history
        WHERE id NOT IN (
          SELECT id
          FROM image_generation_history
          ORDER BY created_at DESC, id DESC
          LIMIT 20
        )
      `);
    });

    const row = db.selectObject("SELECT * FROM image_generation_history WHERE id = ? LIMIT 1", [
      payload.id,
    ]);
    if (row === undefined) {
      throw new EngineRpcError(
        "IMAGE_GENERATION_HISTORY_CREATE_FAILED",
        "Image generation history was not saved.",
      );
    }
    return imageGenerationHistoryRecordFromRow(row);
  }

  private async deleteImageGenerationHistory(id: string): Promise<{ deleted: boolean }> {
    const db = await this.ensureReady();
    db.exec({
      sql: "DELETE FROM image_generation_history WHERE id = ?",
      bind: [id],
    });
    return { deleted: Number(db.selectValue("SELECT changes()") ?? 0) > 0 };
  }

  private async rebuildFts() {
    const db = await this.ensureReady();
    rebuildFtsData(db);
    this.healthState = readyHealth(this.healthState.sqliteVersion);
  }

  private async resetLibrary() {
    const db = await this.ensureReady();
    transaction(db, () => {
      db.exec("DELETE FROM jobs");
      db.exec("DELETE FROM anchors");
      db.exec("DELETE FROM memory_fts");
      db.exec("DELETE FROM chunks");
      db.exec("DELETE FROM memories");
    });
    this.healthState = readyHealth(this.healthState.sqliteVersion);
  }

  private async ensureReady() {
    if (this.db !== null) return this.db;
    if (this.healthState.status === "error") {
      throw new EngineRpcError(
        "ENGINE_UNAVAILABLE",
        this.healthState.message ?? "Engine unavailable",
      );
    }

    this.healthState = startingHealth();
    try {
      const sqliteInit = sqlite3InitModule as unknown as SqliteInitModule;
      const sqlite3 = await sqliteInit({
        locateFile: (path) =>
          path === "sqlite3.wasm" ? new URL(sqliteWasmUrl, location.href).href : path,
      });
      if (sqlite3.oo1.OpfsDb === undefined) {
        throw new EngineRpcError(
          "OPFS_UNAVAILABLE",
          "SQLite OPFS storage is unavailable in this browser context.",
        );
      }

      const db = new sqlite3.oo1.OpfsDb(databasePath, "c");
      this.db = db;
      migrate(db);
      recoverStaleJobs(db);
      const integrity = db.selectValue("PRAGMA integrity_check");
      if (integrity !== "ok") {
        this.healthState = {
          status: "degraded",
          message: "SQLite integrity check did not return ok.",
          detail: String(integrity),
          sqliteVersion: sqlite3.version.libVersion,
          opfs: "available",
          checkedAt: new Date().toISOString(),
        };
        throw new EngineRpcError("SQLITE_INTEGRITY", "Local memory storage needs repair.");
      }

      this.healthState = readyHealth(sqlite3.version.libVersion);
      return db;
    } catch (error) {
      if (error instanceof EngineRpcError && error.code === "SQLITE_INTEGRITY") {
        throw error;
      }
      const engineError = engineErrorFromUnknown(error, "ENGINE_INIT_FAILED");
      this.close();
      this.healthState = {
        status: "error",
        message: engineError.message,
        detail: engineError.detail,
        opfs: "unavailable",
        checkedAt: new Date().toISOString(),
      };
      throw new EngineRpcError(engineError.code, engineError.message, engineError.detail);
    }
  }

  private close() {
    if (this.db === null) return;
    this.db.close();
    this.db = null;
  }
}

const engine = new LocalEngine();

self.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (!isWorkerRequestMessage(event.data)) return;
  const { requestId, request } = event.data;
  void engine
    .handle(request)
    .then((value) => {
      self.postMessage({
        type: CLIO_WORKER_RESPONSE,
        requestId,
        response: { ok: true, value },
      });
    })
    .catch((error) => {
      self.postMessage({
        type: CLIO_WORKER_RESPONSE,
        requestId,
        response: {
          ok: false,
          error: engineErrorFromUnknown(error),
        },
      });
    });
});

function migrate(db: SqliteDb) {
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      source_kind TEXT NOT NULL CHECK (source_kind IN ('page', 'selection')),
      source_url TEXT NOT NULL,
      normalized_source_url TEXT NOT NULL,
      source_title TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      normalized_text TEXT NOT NULL,
      text_hash TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      version_group_key TEXT,
      version_no INTEGER NOT NULL DEFAULT 1,
      supersedes_memory_id TEXT,
      superseded_by_memory_id TEXT,
      is_current INTEGER NOT NULL DEFAULT 1,
      simhash TEXT,
      UNIQUE (source_kind, normalized_source_url, text_hash)
    )
  `);
  ensureColumn(db, "memories", "version_group_key", "version_group_key TEXT");
  ensureColumn(db, "memories", "version_no", "version_no INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "memories", "supersedes_memory_id", "supersedes_memory_id TEXT");
  ensureColumn(db, "memories", "superseded_by_memory_id", "superseded_by_memory_id TEXT");
  ensureColumn(db, "memories", "is_current", "is_current INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "memories", "simhash", "simhash TEXT");

  db.exec(`
    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
      ord INTEGER NOT NULL,
      text TEXT NOT NULL,
      token_count INTEGER NOT NULL,
      hash TEXT NOT NULL,
      fts_text TEXT NOT NULL,
      UNIQUE (memory_id, ord)
    )
  `);
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
      memory_id UNINDEXED,
      chunk_id UNINDEXED,
      source_kind UNINDEXED,
      title,
      body,
      tokenize = 'unicode61 remove_diacritics 2'
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS anchors (
      id TEXT PRIMARY KEY,
      memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('dom')),
      selected_text TEXT NOT NULL,
      context_before TEXT NOT NULL,
      context_after TEXT NOT NULL,
      xpath TEXT,
      text_fragment TEXT,
      created_at TEXT NOT NULL,
      last_resolved_at TEXT,
      last_resolution_status TEXT,
      confidence REAL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'done', 'failed')),
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      run_after TEXT,
      heartbeat_at TEXT,
      payload_json TEXT NOT NULL DEFAULT '{}',
      result_json TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      source_page_url TEXT,
      source_page_title TEXT,
      normalized_page_url TEXT,
      initial_scope TEXT CHECK (initial_scope IS NULL OR initial_scope IN ('general', 'current-page', 'selection')),
      current_evidence_revision INTEGER NOT NULL DEFAULT 0,
      message_count INTEGER NOT NULL DEFAULT 0,
      last_message_excerpt TEXT NOT NULL DEFAULT '',
      owner_id TEXT,
      owner_heartbeat_at TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_evidence (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL,
      source_kind TEXT NOT NULL CHECK (source_kind IN ('page', 'selection')),
      page_url TEXT NOT NULL,
      page_title TEXT NOT NULL,
      text TEXT NOT NULL,
      excerpt TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      UNIQUE (session_id, revision)
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'evidence')),
      status TEXT NOT NULL CHECK (status IN ('queued', 'streaming', 'completed', 'failed', 'cancelled', 'interrupted')),
      content TEXT NOT NULL,
      scope TEXT NOT NULL CHECK (scope IN ('general', 'current-page', 'selection')),
      page_url TEXT,
      page_title TEXT,
      selection_text TEXT,
      citations_json TEXT NOT NULL DEFAULT '[]',
      world_knowledge_json TEXT NOT NULL DEFAULT '[]',
      evidence_refs_json TEXT NOT NULL DEFAULT '[]',
      error_json TEXT,
      retry_json TEXT,
      pi_agent_message_json TEXT,
      run_id TEXT,
      queue_order INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS compactions (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      summary TEXT NOT NULL,
      first_kept_message_id TEXT NOT NULL,
      evidence_summary TEXT NOT NULL,
      first_kept_evidence_id TEXT,
      first_kept_evidence_revision INTEGER,
      previous_compaction_id TEXT REFERENCES compactions(id) ON DELETE SET NULL,
      covered_evidence_json TEXT NOT NULL DEFAULT '[]',
      tokens_before INTEGER NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS web_search_history (
      id TEXT PRIMARY KEY,
      query TEXT NOT NULL,
      answer TEXT NOT NULL,
      sources_json TEXT NOT NULL DEFAULT '[]',
      provider TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS image_generation_history (
      id TEXT PRIMARY KEY,
      mode TEXT NOT NULL CHECK (mode IN ('generate', 'edit')),
      prompt TEXT NOT NULL,
      model TEXT NOT NULL,
      size TEXT NOT NULL,
      provider TEXT NOT NULL,
      output_mime_type TEXT NOT NULL,
      output_data_url TEXT NOT NULL,
      output_b64_json TEXT NOT NULL,
      input_json TEXT,
      created_at TEXT NOT NULL
    )
  `);
  ensureAgentScopeCheckConstraints(db);

  db.exec("CREATE INDEX IF NOT EXISTS idx_memories_captured_at ON memories(captured_at DESC)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_memories_version_group ON memories(version_group_key)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_memories_current ON memories(is_current)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_chunks_memory_ord ON chunks(memory_id, ord)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_anchors_memory ON anchors(memory_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status, run_after)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at DESC)");
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_sessions_owner ON sessions(owner_id, owner_heartbeat_at)",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_session_evidence_session ON session_evidence(session_id, revision)",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_messages_session_created ON messages(session_id, created_at)",
  );
  db.exec("CREATE INDEX IF NOT EXISTS idx_messages_run ON messages(run_id)");
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_compactions_session_created ON compactions(session_id, created_at)",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_compactions_previous ON compactions(previous_compaction_id)",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_web_search_history_created ON web_search_history(created_at DESC)",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_image_generation_history_created ON image_generation_history(created_at DESC)",
  );
  db.exec(`
    UPDATE memories
    SET version_group_key = CASE
      WHEN source_kind = 'selection'
        THEN source_kind || ':' || normalized_source_url || ':' || text_hash
      ELSE source_kind || ':' || normalized_source_url
    END
    WHERE version_group_key IS NULL OR version_group_key = ''
  `);
  db.exec("UPDATE memories SET version_no = 1 WHERE version_no IS NULL OR version_no < 1");
  db.exec("UPDATE memories SET is_current = 1 WHERE is_current IS NULL");
  db.exec(`PRAGMA user_version = ${schemaVersion}`);
}

function ensureColumn(db: SqliteDb, table: string, column: string, declaration: string) {
  const columns = db.selectObjects(`PRAGMA table_info(${table})`);
  const exists = columns.some((row) => stringField(row, "name") === column);
  if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${declaration}`);
}

function ensureAgentScopeCheckConstraints(db: SqliteDb) {
  const sessionsSql = tableCreateSql(db, "sessions");
  const messagesSql = tableCreateSql(db, "messages");
  if (sessionsSql.includes("'general'") && messagesSql.includes("'general'")) return;

  db.exec("PRAGMA foreign_keys = OFF");
  try {
    transaction(db, () => {
      if (!sessionsSql.includes("'general'")) rebuildSessionsTable(db);
      if (!messagesSql.includes("'general'")) rebuildMessagesTable(db);
    });
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
}

function tableCreateSql(db: SqliteDb, table: string) {
  const row = db.selectObject("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?", [
    table,
  ]);
  return stringField(row ?? {}, "sql");
}

function rebuildSessionsTable(db: SqliteDb) {
  db.exec(`
    CREATE TABLE sessions_new (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      source_page_url TEXT,
      source_page_title TEXT,
      normalized_page_url TEXT,
      initial_scope TEXT CHECK (initial_scope IS NULL OR initial_scope IN ('general', 'current-page', 'selection')),
      current_evidence_revision INTEGER NOT NULL DEFAULT 0,
      message_count INTEGER NOT NULL DEFAULT 0,
      last_message_excerpt TEXT NOT NULL DEFAULT '',
      owner_id TEXT,
      owner_heartbeat_at TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  db.exec(`
    INSERT INTO sessions_new (
      id,
      title,
      source_page_url,
      source_page_title,
      normalized_page_url,
      initial_scope,
      current_evidence_revision,
      message_count,
      last_message_excerpt,
      owner_id,
      owner_heartbeat_at,
      metadata_json,
      created_at,
      updated_at
    )
    SELECT
      id,
      title,
      source_page_url,
      source_page_title,
      normalized_page_url,
      initial_scope,
      current_evidence_revision,
      message_count,
      last_message_excerpt,
      owner_id,
      owner_heartbeat_at,
      metadata_json,
      created_at,
      updated_at
    FROM sessions
  `);
  db.exec("DROP TABLE sessions");
  db.exec("ALTER TABLE sessions_new RENAME TO sessions");
}

function rebuildMessagesTable(db: SqliteDb) {
  db.exec(`
    CREATE TABLE messages_new (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'evidence')),
      status TEXT NOT NULL CHECK (status IN ('queued', 'streaming', 'completed', 'failed', 'cancelled', 'interrupted')),
      content TEXT NOT NULL,
      scope TEXT NOT NULL CHECK (scope IN ('general', 'current-page', 'selection')),
      page_url TEXT,
      page_title TEXT,
      selection_text TEXT,
      citations_json TEXT NOT NULL DEFAULT '[]',
      world_knowledge_json TEXT NOT NULL DEFAULT '[]',
      evidence_refs_json TEXT NOT NULL DEFAULT '[]',
      error_json TEXT,
      retry_json TEXT,
      pi_agent_message_json TEXT,
      run_id TEXT,
      queue_order INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  db.exec(`
    INSERT INTO messages_new (
      id,
      session_id,
      role,
      status,
      content,
      scope,
      page_url,
      page_title,
      selection_text,
      citations_json,
      world_knowledge_json,
      evidence_refs_json,
      error_json,
      retry_json,
      pi_agent_message_json,
      run_id,
      queue_order,
      created_at,
      updated_at
    )
    SELECT
      id,
      session_id,
      role,
      status,
      content,
      scope,
      page_url,
      page_title,
      selection_text,
      citations_json,
      world_knowledge_json,
      evidence_refs_json,
      error_json,
      retry_json,
      pi_agent_message_json,
      run_id,
      queue_order,
      created_at,
      updated_at
    FROM messages
  `);
  db.exec("DROP TABLE messages");
  db.exec("ALTER TABLE messages_new RENAME TO messages");
}

function recoverStaleJobs(db: SqliteDb) {
  const cutoff = new Date(Date.now() - staleJobMs).toISOString();
  transaction(db, () => {
    db.exec({
      sql: `UPDATE jobs
            SET status = 'failed',
                finished_at = ?,
                last_error = COALESCE(last_error, 'Job was running when the engine stopped.')
            WHERE status = 'running'
              AND attempts >= max_attempts
              AND (heartbeat_at IS NULL OR heartbeat_at < ?)`,
      bind: [new Date().toISOString(), cutoff],
    });
    db.exec({
      sql: `UPDATE jobs
            SET status = 'queued',
                started_at = NULL,
                heartbeat_at = NULL,
                run_after = ?
            WHERE status = 'running'
              AND attempts < max_attempts
              AND (heartbeat_at IS NULL OR heartbeat_at < ?)`,
      bind: [new Date().toISOString(), cutoff],
    });
  });
}

function enqueueJob(db: SqliteDb, type: JobType, payload: Record<string, unknown>) {
  const now = new Date().toISOString();
  const jobId = createId("job");
  db.exec({
    sql: `INSERT INTO jobs (
      id,
      type,
      status,
      attempts,
      max_attempts,
      run_after,
      payload_json,
      created_at
    ) VALUES (?, ?, 'queued', 0, ?, ?, ?, ?)`,
    bind: [jobId, type, defaultJobMaxAttempts, now, JSON.stringify(payload), now],
  });
  return jobId;
}

function runJob(db: SqliteDb, jobId: string): JobSummary {
  const job = db.selectObject("SELECT * FROM jobs WHERE id = ? LIMIT 1", [jobId]);
  if (job === undefined) {
    throw new EngineRpcError("JOB_NOT_FOUND", `Job not found: ${jobId}`);
  }
  if (stringField(job, "status") !== "queued") return jobSummaryFromRow(job);

  const now = new Date().toISOString();
  const attempts = numberField(job, "attempts") + 1;
  db.exec({
    sql: `UPDATE jobs
          SET status = 'running',
              attempts = ?,
              started_at = COALESCE(started_at, ?),
              heartbeat_at = ?,
              last_error = NULL
          WHERE id = ?`,
    bind: [attempts, now, now, jobId],
  });

  try {
    const type = jobTypeField(job, "type");
    if (type === "reindex_fts") {
      rebuildFtsData(db);
    } else if (type === "resolve_anchor" || type === "post_capture_hardening") {
      // Reserved job types are intentionally no-op until their async work expands.
    } else {
      throw new EngineRpcError("UNKNOWN_JOB_TYPE", `Unknown job type: ${stringField(job, "type")}`);
    }
    const finishedAt = new Date().toISOString();
    db.exec({
      sql: `UPDATE jobs
            SET status = 'done',
                heartbeat_at = ?,
                finished_at = ?,
                result_json = ?
            WHERE id = ?`,
      bind: [finishedAt, finishedAt, JSON.stringify({ ok: true }), jobId],
    });
  } catch (error) {
    const engineError = engineErrorFromUnknown(error);
    const maxAttempts = Math.max(1, numberField(job, "max_attempts"));
    const failed = attempts >= maxAttempts;
    db.exec({
      sql: `UPDATE jobs
            SET status = ?,
                run_after = ?,
                heartbeat_at = NULL,
                finished_at = ?,
                last_error = ?
            WHERE id = ?`,
      bind: [
        failed ? "failed" : "queued",
        new Date(Date.now() + attempts * 1000).toISOString(),
        failed ? new Date().toISOString() : null,
        engineError.message,
        jobId,
      ],
    });
  }

  const updated = db.selectObject("SELECT * FROM jobs WHERE id = ? LIMIT 1", [jobId]);
  if (updated === undefined) {
    throw new EngineRpcError("JOB_NOT_FOUND", `Job not found after run: ${jobId}`);
  }
  return jobSummaryFromRow(updated);
}

function rebuildFtsData(db: SqliteDb) {
  transaction(db, () => {
    db.exec("DELETE FROM memory_fts");
    const rows = db.selectObjects(
      `SELECT
        m.id AS memory_id,
        m.source_kind,
        m.source_title,
        c.id AS chunk_id,
        c.text
       FROM chunks c
       JOIN memories m ON m.id = c.memory_id
       ORDER BY m.captured_at DESC, c.ord ASC`,
    );
    for (const row of rows) {
      insertFtsRow(db, {
        memoryId: stringField(row, "memory_id"),
        chunkId: stringField(row, "chunk_id"),
        sourceKind: sourceKindField(row, "source_kind"),
        title: stringField(row, "source_title"),
        text: stringField(row, "text"),
      });
    }
  });
}

function insertFtsRow(
  db: SqliteDb,
  input: {
    memoryId: string;
    chunkId: string;
    sourceKind: SourceKind;
    title: string;
    text: string;
  },
) {
  db.exec({
    sql: `INSERT INTO memory_fts (
      memory_id,
      chunk_id,
      source_kind,
      title,
      body
    ) VALUES (?, ?, ?, ?, ?)`,
    bind: [
      input.memoryId,
      input.chunkId,
      input.sourceKind,
      input.title,
      expandChineseBigrams(input.text),
    ],
  });
}

function insertAnchor(
  db: SqliteDb,
  memoryId: string,
  payload: CaptureSelectionPayload,
  selectedText: string,
  createdAt: string,
) {
  db.exec({
    sql: `INSERT INTO anchors (
      id,
      memory_id,
      kind,
      selected_text,
      context_before,
      context_after,
      xpath,
      text_fragment,
      created_at
    ) VALUES (?, ?, 'dom', ?, ?, ?, ?, ?, ?)`,
    bind: [
      createId("anchor"),
      memoryId,
      selectedText,
      payload.contextBefore ?? "",
      payload.contextAfter ?? "",
      payload.xpath ?? null,
      payload.textFragment ?? null,
      createdAt,
    ],
  });
}

function findCurrentPageVersion(db: SqliteDb, versionGroupKey: string) {
  return db.selectObject(
    `SELECT *
     FROM memories
     WHERE source_kind = 'page'
       AND version_group_key = ?
       AND is_current = 1
     ORDER BY captured_at DESC
     LIMIT 1`,
    [versionGroupKey],
  );
}

function transaction<T>(db: SqliteDb, work: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const value = work();
    db.exec("COMMIT");
    return value;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // Keep the original operation error.
    }
    throw error;
  }
}

function memorySummaryFromRow(row: SqlRow): MemorySummary {
  const sourceKind = sourceKindField(row, "source_kind");
  const normalizedSourceUrl =
    stringField(row, "normalized_source_url") || normalizeSourceUrl(stringField(row, "source_url"));
  const groupKey =
    stringField(row, "version_group_key") ||
    buildMemoryVersionGroupKey(sourceKind, normalizedSourceUrl, stringField(row, "text_hash"));
  const supersedesMemoryId = optionalString(row, "supersedes_memory_id");
  const supersededByMemoryId = optionalString(row, "superseded_by_memory_id");
  return {
    id: stringField(row, "id"),
    sourceKind,
    sourceUrl: stringField(row, "source_url"),
    sourceTitle: stringField(row, "source_title"),
    capturedAt: stringField(row, "captured_at"),
    excerpt: excerpt(stringField(row, "normalized_text")),
    version: {
      groupKey,
      versionNo: Math.max(1, numberField(row, "version_no")),
      isCurrent: numberField(row, "is_current") !== 0,
      ...(supersedesMemoryId === undefined ? {} : { supersedesMemoryId }),
      ...(supersededByMemoryId === undefined ? {} : { supersededByMemoryId }),
    },
  };
}

function anchorFromRow(row: SqlRow): AnchorInfo {
  const xpath = optionalString(row, "xpath");
  const textFragment = optionalString(row, "text_fragment");
  const lastResolutionStatus = optionalString(row, "last_resolution_status");
  return {
    id: stringField(row, "id"),
    memoryId: stringField(row, "memory_id"),
    selectedText: stringField(row, "selected_text"),
    contextBefore: stringField(row, "context_before"),
    contextAfter: stringField(row, "context_after"),
    ...(xpath === undefined ? {} : { xpath }),
    ...(textFragment === undefined ? {} : { textFragment }),
    ...(lastResolutionStatus === undefined ? {} : { lastResolutionStatus }),
  };
}

function jobSummaryFromRow(row: SqlRow): JobSummary {
  const lastError = optionalString(row, "last_error");
  const startedAt = optionalString(row, "started_at");
  const finishedAt = optionalString(row, "finished_at");
  return {
    id: stringField(row, "id"),
    type: jobTypeField(row, "type"),
    status: jobStatusField(row, "status"),
    attempts: numberField(row, "attempts"),
    maxAttempts: numberField(row, "max_attempts"),
    createdAt: stringField(row, "created_at"),
    ...(lastError === undefined ? {} : { lastError }),
    ...(startedAt === undefined ? {} : { startedAt }),
    ...(finishedAt === undefined ? {} : { finishedAt }),
  };
}

function chatSessionSummaryFromRow(row: SqlRow): ChatSessionSummary {
  const sourcePageUrl = optionalString(row, "source_page_url");
  const sourcePageTitle = optionalString(row, "source_page_title");
  const ownerId = optionalString(row, "owner_id");
  const ownerHeartbeatAt = optionalString(row, "owner_heartbeat_at");
  return {
    id: stringField(row, "id"),
    title: stringField(row, "title"),
    createdAt: stringField(row, "created_at"),
    updatedAt: stringField(row, "updated_at"),
    messageCount: numberField(row, "message_count"),
    lastMessageExcerpt: stringField(row, "last_message_excerpt"),
    currentEvidenceRevision: numberField(row, "current_evidence_revision"),
    ...(sourcePageUrl === undefined ? {} : { sourcePageUrl }),
    ...(sourcePageTitle === undefined ? {} : { sourcePageTitle }),
    ...(ownerId === undefined ? {} : { ownerId }),
    ...(ownerHeartbeatAt === undefined ? {} : { ownerHeartbeatAt }),
  };
}

function sessionEvidenceFromRow(row: SqlRow): SessionEvidenceRecord {
  return {
    id: stringField(row, "id"),
    sessionId: stringField(row, "session_id"),
    revision: numberField(row, "revision"),
    sourceKind: sourceKindField(row, "source_kind"),
    pageUrl: stringField(row, "page_url"),
    pageTitle: stringField(row, "page_title"),
    text: stringField(row, "text"),
    excerpt: stringField(row, "excerpt"),
    metadata: parseMetadata(stringField(row, "metadata_json")),
    createdAt: stringField(row, "created_at"),
  };
}

function compactionRecordFromRow(row: SqlRow): CompactionRecord {
  const firstKeptEvidenceId = optionalString(row, "first_kept_evidence_id");
  const rawFirstKeptEvidenceRevision = row.first_kept_evidence_revision;
  const firstKeptEvidenceRevision =
    rawFirstKeptEvidenceRevision === null || rawFirstKeptEvidenceRevision === undefined
      ? undefined
      : numberField(row, "first_kept_evidence_revision");
  const previousCompactionId = optionalString(row, "previous_compaction_id");
  return {
    id: stringField(row, "id"),
    sessionId: stringField(row, "session_id"),
    summary: stringField(row, "summary"),
    firstKeptMessageId: stringField(row, "first_kept_message_id"),
    evidenceSummary: stringField(row, "evidence_summary"),
    ...(firstKeptEvidenceId === undefined ? {} : { firstKeptEvidenceId }),
    ...(firstKeptEvidenceRevision === undefined ? {} : { firstKeptEvidenceRevision }),
    ...(previousCompactionId === undefined ? {} : { previousCompactionId }),
    coveredEvidence: parseCoveredEvidence(stringField(row, "covered_evidence_json")),
    tokensBefore: numberField(row, "tokens_before"),
    createdAt: stringField(row, "created_at"),
  };
}

function chatMessageRecordFromRow(row: SqlRow): ChatMessageRecord {
  const pageUrl = optionalString(row, "page_url");
  const pageTitle = optionalString(row, "page_title");
  const selectionText = optionalString(row, "selection_text");
  const error = parseOptionalRecord(stringField(row, "error_json"));
  const retry = parseOptionalRecord(stringField(row, "retry_json"));
  const piAgentMessageJson = parseOptionalRecord(stringField(row, "pi_agent_message_json"));
  const runId = optionalString(row, "run_id");
  const rawQueueOrder = row.queue_order;
  const queueOrder =
    rawQueueOrder === null || rawQueueOrder === undefined
      ? undefined
      : numberField(row, "queue_order");
  return {
    id: stringField(row, "id"),
    sessionId: stringField(row, "session_id"),
    role: chatMessageRoleField(row, "role"),
    status: chatMessageStatusField(row, "status"),
    content: stringField(row, "content"),
    scope: agentScopeField(row, "scope"),
    createdAt: stringField(row, "created_at"),
    updatedAt: stringField(row, "updated_at"),
    ...(pageUrl === undefined ? {} : { pageUrl }),
    ...(pageTitle === undefined ? {} : { pageTitle }),
    ...(selectionText === undefined ? {} : { selectionText }),
    citations: parseJsonArray(stringField(row, "citations_json")) as ChatMessageRecord["citations"],
    worldKnowledge: parseStringArray(stringField(row, "world_knowledge_json")),
    evidenceRefs: parseStringArray(stringField(row, "evidence_refs_json")),
    ...(error === undefined ? {} : { error: error as unknown as ChatMessageRecord["error"] }),
    ...(retry === undefined ? {} : { retry }),
    ...(piAgentMessageJson === undefined ? {} : { piAgentMessageJson }),
    ...(runId === undefined ? {} : { runId }),
    ...(queueOrder === undefined ? {} : { queueOrder }),
  };
}

function webSearchHistoryRecordFromRow(row: SqlRow): WebSearchHistoryRecord {
  return {
    id: stringField(row, "id"),
    query: stringField(row, "query"),
    answer: stringField(row, "answer"),
    sources: parseWebSearchSources(stringField(row, "sources_json")),
    provider: stringField(row, "provider"),
    createdAt: stringField(row, "created_at"),
  };
}

function imageGenerationHistoryRecordFromRow(row: SqlRow): ImageGenerationHistoryRecord {
  const input = parseImageInput(stringField(row, "input_json"));
  return {
    id: stringField(row, "id"),
    mode: imageGenerationModeField(row, "mode"),
    prompt: stringField(row, "prompt"),
    model: stringField(row, "model"),
    size: stringField(row, "size"),
    provider: stringField(row, "provider"),
    createdAt: stringField(row, "created_at"),
    output: {
      mimeType: stringField(row, "output_mime_type"),
      dataUrl: stringField(row, "output_data_url"),
      b64Json: stringField(row, "output_b64_json"),
    },
    ...(input === undefined ? {} : { input }),
  };
}

function loadChatSessionDetail(db: SqliteDb, sessionId: string): ChatSessionDetail | null {
  const row = db.selectObject("SELECT * FROM sessions WHERE id = ? LIMIT 1", [sessionId]);
  if (row === undefined) return null;
  const messageRows = db.selectObjects(
    `SELECT *
     FROM messages
     WHERE session_id = ?
     ORDER BY created_at ASC, id ASC`,
    [sessionId],
  );
  const evidenceRows = db.selectObjects(
    `SELECT *
     FROM session_evidence
     WHERE session_id = ?
     ORDER BY revision ASC`,
    [sessionId],
  );
  return {
    ...chatSessionSummaryFromRow(row),
    messages: messageRows.map(chatMessageRecordFromRow).sort(compareChatMessagesForDisplay),
    evidence: evidenceRows.map(sessionEvidenceFromRow),
  };
}

function refreshSessionStats(db: SqliteDb, sessionId: string, updatedAt: string) {
  const messageCount = Number(
    db.selectValue("SELECT count(*) FROM messages WHERE session_id = ?", [sessionId]) ?? 0,
  );
  const latest = db.selectObject(
    `SELECT content
     FROM messages
     WHERE session_id = ?
       AND role IN ('user', 'assistant')
     ORDER BY updated_at DESC, created_at DESC
     LIMIT 1`,
    [sessionId],
  );
  db.exec({
    sql: `UPDATE sessions
          SET message_count = ?,
              last_message_excerpt = ?,
              updated_at = ?
          WHERE id = ?`,
    bind: [messageCount, excerpt(stringField(latest ?? {}, "content"), 140), updatedAt, sessionId],
  });
}

function defaultPiAgentMessageJson(payload: UpsertChatMessagePayload): Record<string, unknown> {
  if (payload.role === "evidence") {
    return {
      role: "system",
      kind: "clio_evidence_event",
      content: payload.content,
      evidenceRefs: payload.evidenceRefs ?? [],
      timestamp: Date.parse(payload.createdAt ?? "") || Date.now(),
    };
  }
  return {
    role: payload.role,
    content: payload.content,
    timestamp: Date.parse(payload.createdAt ?? "") || Date.now(),
  };
}

function normalizeSessionTitle(value: string) {
  const normalized = normalizeText(value).slice(0, 40);
  return normalized.length > 0 ? normalized : "New conversation";
}

function isStaleSessionLease(heartbeatAt: string) {
  const timestamp = Date.parse(heartbeatAt);
  if (!Number.isFinite(timestamp)) return true;
  return Date.now() - timestamp > staleSessionLeaseMs;
}

function parseMetadata(input: string): Record<string, unknown> {
  try {
    const value = JSON.parse(input) as unknown;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    return {};
  }
  return {};
}

function parseOptionalRecord(input: string): Record<string, unknown> | undefined {
  if (input.length === 0 || input === "null") return undefined;
  const parsed = parseMetadata(input);
  return Object.keys(parsed).length === 0 ? undefined : parsed;
}

function parseJsonArray(input: string): unknown[] {
  try {
    const value = JSON.parse(input) as unknown;
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function parseStringArray(input: string): string[] {
  return parseJsonArray(input).flatMap((item) => (typeof item === "string" ? [item] : []));
}

function parseCoveredEvidence(input: string) {
  return parseJsonArray(input).flatMap((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string" || typeof record.revision !== "number") return [];
    return [{ id: record.id, revision: record.revision }];
  });
}

function parseWebSearchSources(input: string): WebSearchHistoryRecord["sources"] {
  return parseJsonArray(input).flatMap((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    if (
      typeof record.id !== "string" ||
      typeof record.title !== "string" ||
      typeof record.url !== "string" ||
      typeof record.domain !== "string" ||
      typeof record.snippet !== "string"
    ) {
      return [];
    }
    return [
      {
        id: record.id,
        title: record.title,
        url: record.url,
        domain: record.domain,
        snippet: record.snippet,
      },
    ];
  });
}

function parseImageInput(input: string): ImageGenerationHistoryRecord["input"] | undefined {
  if (input.length === 0 || input === "null") return undefined;
  try {
    const value = JSON.parse(input) as unknown;
    if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
    const record = value as Record<string, unknown>;
    if (
      (record.kind !== "data_url" && record.kind !== "base64" && record.kind !== "url") ||
      typeof record.value !== "string"
    ) {
      return undefined;
    }
    return {
      kind: record.kind,
      value: record.value,
      ...(typeof record.mimeType === "string" ? { mimeType: record.mimeType } : {}),
      ...(typeof record.name === "string" ? { name: record.name } : {}),
    };
  } catch {
    return undefined;
  }
}

function stringField(row: SqlRow, key: string) {
  const value = row[key];
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return "";
}

function optionalString(row: SqlRow, key: string) {
  const value = stringField(row, key);
  return value.length === 0 ? undefined : value;
}

function numberField(row: SqlRow, key: string) {
  const value = row[key];
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number.parseInt(value, 10) || 0;
  return 0;
}

function sourceKindField(row: SqlRow, key: string): SourceKind {
  return stringField(row, key) === "selection" ? "selection" : "page";
}

function imageGenerationModeField(row: SqlRow, key: string): ImageGenerationHistoryRecord["mode"] {
  return stringField(row, key) === "edit" ? "edit" : "generate";
}

function jobStatusField(row: SqlRow, key: string): JobStatus {
  const value = stringField(row, key);
  if (value === "running" || value === "done" || value === "failed") return value;
  return "queued";
}

function jobTypeField(row: SqlRow, key: string): JobType {
  const value = stringField(row, key);
  if (value === "resolve_anchor" || value === "post_capture_hardening") return value;
  return "reindex_fts";
}

function chatMessageRoleField(row: SqlRow, key: string): ChatMessageRole {
  const value = stringField(row, key);
  if (value === "assistant" || value === "evidence") return value;
  return "user";
}

function chatMessageStatusField(row: SqlRow, key: string): ChatMessageStatus {
  const value = stringField(row, key);
  if (
    value === "streaming" ||
    value === "completed" ||
    value === "failed" ||
    value === "cancelled" ||
    value === "interrupted"
  ) {
    return value;
  }
  return "queued";
}

function agentScopeField(row: SqlRow, key: string): ChatMessageRecord["scope"] {
  const value = stringField(row, key);
  if (value === "general" || value === "selection") return value;
  return "current-page";
}

function clampLimit(limit: number, max: number) {
  if (!Number.isFinite(limit)) return max;
  return Math.max(1, Math.min(Math.floor(limit), max));
}

function createId(prefix: string) {
  const id =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${id}`;
}

function fallbackTitle(sourceUrl: string) {
  try {
    return new URL(sourceUrl).hostname;
  } catch {
    return "Untitled";
  }
}

function startingHealth(): EngineHealth {
  return {
    status: "starting",
    message: "Local memory engine is starting.",
    checkedAt: new Date().toISOString(),
  };
}

function readyHealth(sqliteVersion?: string): EngineHealth {
  return {
    status: "ready",
    message: "Local memory engine is ready.",
    sqliteVersion,
    opfs: "available",
    checkedAt: new Date().toISOString(),
  };
}

function assertNever(value: never): never {
  throw new EngineRpcError("UNSUPPORTED_REQUEST", `Unsupported request: ${String(value)}`);
}
