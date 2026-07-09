import type {
  BuildSourceContextPackPayload,
  ChatMessageRecord,
  ChatSessionDetail,
  CompactionRecord,
  EngineRequest,
  SessionEvidenceRecord,
  SourceContextMapArtifactEntry,
  SourceContextMapArtifactRecord,
  SourceContextMapClaimStepResult,
  SourceContextMapRunDetail,
  SourceContextMapStepPlan,
  SourceContextMapStepRecord,
  SourceContextPackGroup,
  SourceContextPackResult,
  SourceContextPackWindow,
} from "@/src/shared/rpc";
import { hashText } from "@/src/shared/text";
import {
  buildSemanticCitationJudgeInput,
  citationValidatorErrorResult,
  validateCitationCoverage,
} from "./citation-validator";
import {
  type IClioCompactionRuntime,
  buildRequestWithProviderContext,
  estimateProviderContextTokens,
} from "./compaction-context";
import type { SemanticCitationJudge, SemanticCitationJudgeResult } from "./semantic-citation-judge";
import {
  readSourceContextPackRequestOptions,
  sourceContextPackAutoBudgetDefaults,
  sourceContextPackResearchBudgetDefaults,
} from "./source-context-pack-options";
import type {
  AgentChatRequest,
  AgentErrorInfo,
  AgentStreamEvent,
  CitationValidationReason,
  CitationValidationResult,
  EvidenceItem,
  IAgentRuntime,
  LocalCitation,
} from "./types";

export interface AgentRunHostOptions {
  runtime: IAgentRuntime;
  semanticCitationJudge?: SemanticCitationJudge;
  compactionRuntime?: IClioCompactionRuntime;
  requestEngine: <T>(request: EngineRequest) => Promise<T>;
  emitEvent: (event: AgentStreamEvent) => void;
}

export interface AgentRunSubscribeInput {
  runId: string;
  sessionId: string;
  assistantMessageId: string;
}

interface HostedAgentRun {
  request: AgentChatRequest;
  abortController: AbortController;
  providerStarted: boolean;
  citations: LocalCitation[];
  citationValidation?: CitationValidationResult;
  citationRepairCount: number;
  citationRepairReason?: CitationValidationReason;
  worldKnowledge: string[];
  content: string;
  sourceContextMapSchedulerRunId?: string;
  sourceContextReduceArtifact?: SourceContextReduceArtifactState;
}

interface HostedManualCompactRun {
  runId: string;
  sessionId?: string;
  abortController: AbortController;
}

interface SourceContextPackPreparation {
  pack: SourceContextPackResult;
  evidence: EvidenceItem[];
  options: NonNullable<AgentChatRequest["sourceContextPack"]>;
}

interface PreparedProviderRequest {
  request: AgentChatRequest;
  sourceContextPack?: SourceContextPackPreparation;
}

interface SourceContextMapResult {
  groupId: string;
  text: string;
  citations: LocalCitation[];
  evidenceIds: string[];
  tokenEstimate: number;
  artifactId?: string;
}

interface SourceContextMapPlanGroup {
  group: SourceContextPackGroup;
  groupEvidence: EvidenceItem[];
  groupId: string;
  groupIndex: number;
  groupCount: number;
  stepPlan: SourceContextMapStepPlan;
}

interface SourceContextReduceArtifactState {
  mapArtifactIds: string[];
  inputSummary: string;
  tokenEstimate: number;
}

class SourceContextMapReduceStageError extends Error {
  readonly stage: "map" | "reduce";
  readonly providerError?: AgentErrorInfo;

  constructor(stage: "map" | "reduce", message: string, providerError?: AgentErrorInfo) {
    super(message);
    this.name = "SourceContextMapReduceStageError";
    this.stage = stage;
    this.providerError = providerError;
  }
}

export class AgentRunHost {
  private readonly activeRuns = new Map<string, HostedAgentRun>();
  private readonly activeManualCompactions = new Map<string, HostedManualCompactRun>();
  private readonly runtime: IAgentRuntime;
  private readonly semanticCitationJudge?: SemanticCitationJudge;
  private readonly compactionRuntime?: IClioCompactionRuntime;
  private readonly requestEngine: AgentRunHostOptions["requestEngine"];
  private readonly emitEvent: AgentRunHostOptions["emitEvent"];

  constructor(options: AgentRunHostOptions) {
    this.runtime = options.runtime;
    this.semanticCitationJudge = options.semanticCitationJudge;
    this.compactionRuntime = options.compactionRuntime;
    this.requestEngine = options.requestEngine;
    this.emitEvent = options.emitEvent;
  }

  start(request: AgentChatRequest) {
    const existing = this.activeRuns.get(request.runId);
    if (existing !== undefined) {
      this.emitEvent({ type: "run_started", runId: request.runId });
      return;
    }

    const run: HostedAgentRun = {
      request,
      abortController: new AbortController(),
      providerStarted: false,
      citations: [],
      citationRepairCount: 0,
      worldKnowledge: [],
      content: "",
    };
    this.activeRuns.set(request.runId, run);
    void this.pump(run);
  }

  async subscribe(input: AgentRunSubscribeInput) {
    if (this.activeRuns.has(input.runId)) {
      this.emitEvent({ type: "run_started", runId: input.runId });
      return;
    }

    const event: AgentStreamEvent = {
      type: "run_failed",
      runId: input.runId,
      error: {
        code: "PROVIDER_INTERRUPTED",
        message: "Clio lost the active answer. Retry when ready.",
      },
    };
    try {
      await this.requestEngine<ChatMessageRecord>({
        kind: "updateChatMessage",
        payload: {
          id: input.assistantMessageId,
          sessionId: input.sessionId,
          status: "interrupted",
          error: event.error,
          updatedAt: new Date().toISOString(),
        },
      });
    } finally {
      this.emitEvent(event);
    }
  }

  cancel(runId: string) {
    const activeRun = this.activeRuns.get(runId);
    activeRun?.abortController.abort();
    if (activeRun?.sourceContextMapSchedulerRunId !== undefined) {
      void this.cancelSourceContextMapSchedulerRun(activeRun);
    }
    this.activeManualCompactions.get(runId)?.abortController.abort();
  }

  snapshot(runId: string) {
    return this.activeRuns.has(runId) || this.activeManualCompactions.has(runId)
      ? { active: true as const, runId }
      : { active: false as const, runId };
  }

  startManualCompact(input: { runId: string; sessionId?: string }) {
    if (this.activeManualCompactions.has(input.runId)) {
      this.emitEvent({
        type: "runtime_status",
        runId: input.runId,
        message: "Compacting...",
        running: true,
      });
      return;
    }

    const run: HostedManualCompactRun = {
      runId: input.runId,
      sessionId: input.sessionId,
      abortController: new AbortController(),
    };
    this.activeManualCompactions.set(input.runId, run);
    void this.pumpManualCompact(run);
  }

  private async pump(run: HostedAgentRun) {
    let terminalEventEmitted = false;
    let reduceFailureFallbackRequest: AgentChatRequest | undefined;
    let visibleAnswerStarted = false;
    try {
      const prepared = await this.prepareProviderRequest(run);
      if (prepared === undefined) {
        terminalEventEmitted = true;
        return;
      }

      run.providerStarted = true;
      const providerPreparation = await this.prepareMapReduceProviderRequest(run, prepared);
      run.request = providerPreparation.request;
      reduceFailureFallbackRequest = providerPreparation.reduceFailureFallbackRequest;
      providerAttempts: while (!run.abortController.signal.aborted) {
        try {
          for await (const event of this.runtime.streamChat(run.request, {
            signal: run.abortController.signal,
          })) {
            if (
              event.type === "run_failed" &&
              reduceFailureFallbackRequest !== undefined &&
              !visibleAnswerStarted &&
              !run.abortController.signal.aborted
            ) {
              await this.persistSourceContextReduceArtifact(run, {
                stage: "reduce",
                status: "failed",
                mapArtifactIds: run.sourceContextReduceArtifact?.mapArtifactIds,
                inputSummary: run.sourceContextReduceArtifact?.inputSummary,
                tokenEstimate: run.sourceContextReduceArtifact?.tokenEstimate,
                errorCode: event.error.code,
                errorMessage: event.error.message,
              });
              run.sourceContextReduceArtifact = undefined;
              this.emitEvent({
                type: "runtime_status",
                runId: run.request.runId,
                message: sourceContextMapReduceFallbackMessage("reduce", event.error),
              });
              run.request = reduceFailureFallbackRequest;
              reduceFailureFallbackRequest = undefined;
              visibleAnswerStarted = false;
              continue providerAttempts;
            }
            if (isVisibleAssistantAnswerEvent(event)) {
              visibleAnswerStarted = true;
            }
            if (event.type === "run_failed" && run.sourceContextReduceArtifact !== undefined) {
              await this.persistSourceContextReduceArtifact(run, {
                stage: "reduce",
                status: "failed",
                mapArtifactIds: run.sourceContextReduceArtifact.mapArtifactIds,
                inputSummary: run.sourceContextReduceArtifact.inputSummary,
                tokenEstimate: run.sourceContextReduceArtifact.tokenEstimate,
                errorCode: event.error.code,
                errorMessage: event.error.message,
              });
              run.sourceContextReduceArtifact = undefined;
              reduceFailureFallbackRequest = undefined;
            }
            if (event.type === "run_cancelled" && run.sourceContextReduceArtifact !== undefined) {
              await this.persistSourceContextReduceArtifact(run, {
                stage: "reduce",
                status: "failed",
                mapArtifactIds: run.sourceContextReduceArtifact.mapArtifactIds,
                inputSummary: run.sourceContextReduceArtifact.inputSummary,
                tokenEstimate: run.sourceContextReduceArtifact.tokenEstimate,
                errorCode: "CANCELLED",
                errorMessage: event.reason ?? "Map-reduce reduce stage was cancelled.",
              });
              run.sourceContextReduceArtifact = undefined;
              reduceFailureFallbackRequest = undefined;
            }
            if (event.type === "run_completed") {
              const validationEvent = await this.buildCitationValidationEvent(run);
              if (this.shouldRepairCitationValidation(run, validationEvent.validation)) {
                reduceFailureFallbackRequest = undefined;
                await this.startCitationRepair(run, validationEvent.validation);
                visibleAnswerStarted = false;
                continue providerAttempts;
              }
              await this.persistSourceContextReduceArtifact(run, {
                stage: "reduce",
                status: "completed",
                mapArtifactIds: run.sourceContextReduceArtifact?.mapArtifactIds,
                inputSummary: run.sourceContextReduceArtifact?.inputSummary,
                outputSummary: truncatePromptText(run.content, 1800),
                tokenEstimate: run.sourceContextReduceArtifact?.tokenEstimate,
              });
              run.sourceContextReduceArtifact = undefined;
              await this.persistEvent(run, validationEvent);
              this.emitEvent(validationEvent);
            }
            await this.persistEvent(run, event);
            if (isTerminalAgentEvent(event)) {
              terminalEventEmitted = true;
              if (event.type === "run_completed") {
                await this.startNextQueuedFollowUp(run);
              }
              this.emitEvent(event);
              return;
            }
            this.emitEvent(event);
          }
        } catch (error) {
          if (
            reduceFailureFallbackRequest !== undefined &&
            !visibleAnswerStarted &&
            !run.abortController.signal.aborted
          ) {
            const providerError = providerErrorFromUnknown(error);
            await this.persistSourceContextReduceArtifact(run, {
              stage: "reduce",
              status: "failed",
              mapArtifactIds: run.sourceContextReduceArtifact?.mapArtifactIds,
              inputSummary: run.sourceContextReduceArtifact?.inputSummary,
              tokenEstimate: run.sourceContextReduceArtifact?.tokenEstimate,
              errorCode: providerError.code,
              errorMessage: providerError.message,
            });
            run.sourceContextReduceArtifact = undefined;
            this.emitEvent({
              type: "runtime_status",
              runId: run.request.runId,
              message: sourceContextMapReduceFallbackMessage("reduce", providerError),
            });
            run.request = reduceFailureFallbackRequest;
            reduceFailureFallbackRequest = undefined;
            visibleAnswerStarted = false;
            continue;
          }
          throw error;
        }
      }
    } catch (error) {
      if (run.abortController.signal.aborted) {
        await this.cancelSourceContextMapSchedulerRun(run);
        if (run.providerStarted) {
          const event: AgentStreamEvent = {
            type: "run_cancelled",
            runId: run.request.runId,
            reason: "User stopped the response.",
          };
          await this.persistEvent(run, event);
          this.emitEvent(event);
        } else {
          await this.resolvePreProviderStop(run);
        }
        terminalEventEmitted = true;
        return;
      }
      const event: AgentStreamEvent = {
        type: "run_failed",
        runId: run.request.runId,
        error: {
          code: "PROVIDER_ERROR",
          message: error instanceof Error ? error.message : String(error),
        },
      };
      if (run.sourceContextReduceArtifact !== undefined) {
        await this.persistSourceContextReduceArtifact(run, {
          stage: "reduce",
          status: "failed",
          mapArtifactIds: run.sourceContextReduceArtifact.mapArtifactIds,
          inputSummary: run.sourceContextReduceArtifact.inputSummary,
          tokenEstimate: run.sourceContextReduceArtifact.tokenEstimate,
          errorCode: event.error.code,
          errorMessage: event.error.message,
        });
        run.sourceContextReduceArtifact = undefined;
      }
      await this.persistEvent(run, event);
      this.emitEvent(event);
      terminalEventEmitted = true;
    } finally {
      if (run.abortController.signal.aborted && !terminalEventEmitted) {
        await this.cancelSourceContextMapSchedulerRun(run);
        const event: AgentStreamEvent = {
          type: "run_cancelled",
          runId: run.request.runId,
          reason: "User stopped the response.",
        };
        await this.persistEvent(run, event);
        this.emitEvent(event);
      }
      this.activeRuns.delete(run.request.runId);
    }
  }

  private async prepareProviderRequest(
    run: HostedAgentRun,
  ): Promise<PreparedProviderRequest | undefined> {
    const sourceContextPreparation = await this.buildSourceContextPackRequest(run);
    if (run.abortController.signal.aborted) {
      await this.resolvePreProviderStop(run);
      return undefined;
    }

    const sourceContextRequest = sourceContextPreparation.request;
    const { sessionId } = sourceContextRequest;
    if (this.compactionRuntime === undefined || sessionId === undefined) {
      return sourceContextPreparation;
    }

    const session = await this.requestEngine<ChatSessionDetail | null>({
      kind: "loadChatSession",
      sessionId,
    });
    if (session === null) return sourceContextPreparation;

    let latestCompaction = await this.requestEngine<CompactionRecord | null>({
      kind: "getLatestCompaction",
      sessionId,
    });
    const contextWindow = await this.compactionRuntime.getContextWindow();
    let requestWithContext = buildRequestWithProviderContext({
      request: sourceContextRequest,
      session,
      latestCompaction,
    });

    if (
      this.compactionRuntime.shouldCompact(
        estimateProviderContextTokens(requestWithContext),
        contextWindow,
      )
    ) {
      this.emitEvent({
        type: "runtime_status",
        runId: run.request.runId,
        message: "Compacting...",
        running: true,
      });
      try {
        const outcome = await this.compactionRuntime.compact({
          session,
          latestCompaction,
          currentRequest: sourceContextRequest,
          signal: run.abortController.signal,
        });
        if (run.abortController.signal.aborted) {
          await this.resolvePreProviderStop(run);
          return undefined;
        }
        if (outcome.status === "compacted") {
          latestCompaction = await this.requestEngine<CompactionRecord>({
            kind: "appendCompaction",
            payload: outcome.payload,
          });
          requestWithContext = buildRequestWithProviderContext({
            request: sourceContextRequest,
            session,
            latestCompaction,
          });
          if (run.abortController.signal.aborted) {
            await this.resolvePreProviderStop(run);
            return undefined;
          }
        }
      } catch {
        if (run.abortController.signal.aborted) {
          await this.resolvePreProviderStop(run);
          return undefined;
        }
      }
    }

    if (run.abortController.signal.aborted) {
      await this.resolvePreProviderStop(run);
      return undefined;
    }

    if (estimateProviderContextTokens(requestWithContext) > contextWindow) {
      await this.resolveContextTooLarge(run);
      return undefined;
    }

    return {
      ...sourceContextPreparation,
      request: requestWithContext,
    };
  }

  private async buildSourceContextPackRequest(
    run: HostedAgentRun,
  ): Promise<PreparedProviderRequest> {
    const sourceContextPackOptions = run.request.sourceContextPack;
    if (sourceContextPackOptions === undefined) return { request: run.request };

    this.emitEvent({
      type: "runtime_status",
      runId: run.request.runId,
      message: "Building source context...",
      running: true,
    });

    try {
      const pack = await this.requestEngine<SourceContextPackResult>({
        kind: "buildSourceContextPack",
        payload: sourceContextPackPayload(run.request),
      });
      await this.persistSourceContextCompressionLogs(run, pack);
      const packEvidence = sourceContextPackToEvidence(pack);
      if (packEvidence.length === 0) {
        this.emitEvent({
          type: "runtime_status",
          runId: run.request.runId,
          message: "No source context found; continuing without it.",
        });
        return { request: run.request };
      }

      this.emitEvent({
        type: "runtime_status",
        runId: run.request.runId,
        message: sourceContextPackStatusMessage(pack, packEvidence.length),
      });
      if (sourceContextPackOptions.mapReduce?.enabled === true) {
        this.emitEvent({
          type: "runtime_status",
          runId: run.request.runId,
          message: sourceContextPackMapReducePlanMessage(pack, sourceContextPackOptions),
        });
      }

      return {
        request: {
          ...run.request,
          evidence: mergeEvidence(run.request.evidence, packEvidence),
        },
        sourceContextPack: {
          pack,
          evidence: packEvidence,
          options: sourceContextPackOptions,
        },
      };
    } catch {
      this.emitEvent({
        type: "runtime_status",
        runId: run.request.runId,
        message: "Source context unavailable; continuing without it.",
      });
      return { request: run.request };
    }
  }

  private async prepareMapReduceProviderRequest(
    run: HostedAgentRun,
    prepared: PreparedProviderRequest,
  ): Promise<{ request: AgentChatRequest; reduceFailureFallbackRequest?: AgentChatRequest }> {
    const sourceContextPack = prepared.sourceContextPack;
    if (
      sourceContextPack === undefined ||
      sourceContextPack.options.mapReduce?.enabled !== true ||
      sourceContextPackExecutableGroups(sourceContextPack).length === 0
    ) {
      return { request: prepared.request };
    }

    const fallbackRequest = sourceContextSinglePassRequest(
      prepared.request,
      sourceContextPack.evidence,
    );
    try {
      const mapResults = await this.executeSourceContextMapStage(
        run,
        prepared.request,
        sourceContextPack,
      );
      if (run.abortController.signal.aborted) throw new Error("Map-reduce was cancelled.");
      this.emitEvent({
        type: "runtime_status",
        runId: prepared.request.runId,
        message: sourceContextMapReduceReduceStartedMessage(mapResults),
        running: true,
      });
      const reduceArtifact = await this.persistSourceContextReduceArtifact(run, {
        stage: "reduce",
        status: "started",
        mapArtifactIds: sourceContextMapArtifactIds(mapResults),
        inputSummary: sourceContextReduceArtifactInputSummary(mapResults),
        tokenEstimate: mapResults.reduce((total, result) => total + result.tokenEstimate, 0),
      });
      run.sourceContextReduceArtifact = {
        mapArtifactIds: reduceArtifact?.mapArtifactIds ?? sourceContextMapArtifactIds(mapResults),
        inputSummary: sourceContextReduceArtifactInputSummary(mapResults),
        tokenEstimate: mapResults.reduce((total, result) => total + result.tokenEstimate, 0),
      };
      return {
        request: buildSourceContextReduceRequest(prepared.request, sourceContextPack, mapResults),
        reduceFailureFallbackRequest: fallbackRequest,
      };
    } catch (error) {
      if (run.abortController.signal.aborted) throw error;
      const providerError =
        error instanceof SourceContextMapReduceStageError
          ? error.providerError
          : providerErrorFromUnknown(error);
      this.emitEvent({
        type: "runtime_status",
        runId: prepared.request.runId,
        message: sourceContextMapReduceFallbackMessage("map", providerError),
      });
      return { request: fallbackRequest };
    }
  }

  private async executeSourceContextMapStage(
    run: HostedAgentRun,
    baseRequest: AgentChatRequest,
    sourceContextPack: SourceContextPackPreparation,
  ): Promise<SourceContextMapResult[]> {
    const planGroups = sourceContextMapPlanGroups(baseRequest, sourceContextPack);
    const schedulerRun = await this.createOrResumeSourceContextMapSchedulerRun(
      baseRequest,
      sourceContextPack,
      planGroups,
    );
    run.sourceContextMapSchedulerRunId = schedulerRun.id;

    const resultsByGroupIndex = new Map<number, SourceContextMapResult>();
    const stepBySignature = new Map(
      schedulerRun.steps.map((step) => [step.stepSignature, step] as const),
    );
    for (const planGroup of planGroups) {
      const completedStep = stepBySignature.get(planGroup.stepPlan.stepSignature);
      if (completedStep?.status !== "completed") continue;
      resultsByGroupIndex.set(
        planGroup.groupIndex,
        sourceContextMapResultFromCompletedStep(planGroup, completedStep),
      );
    }

    if (resultsByGroupIndex.size > 0) {
      this.emitEvent({
        type: "runtime_status",
        runId: baseRequest.runId,
        message: `Map-reduce resumed ${resultsByGroupIndex.size}/${planGroups.length} completed map step(s).`,
        running: true,
      });
    }

    await this.executeSourceContextMapSchedulerSteps(
      run,
      baseRequest,
      sourceContextPack,
      schedulerRun.id,
      planGroups,
      resultsByGroupIndex,
    );

    return planGroups.map((planGroup) => {
      const result = resultsByGroupIndex.get(planGroup.groupIndex);
      if (result === undefined) {
        throw new SourceContextMapReduceStageError(
          "map",
          `Map scheduler did not produce group ${planGroup.groupIndex + 1}.`,
        );
      }
      return result;
    });
  }

  private async createOrResumeSourceContextMapSchedulerRun(
    baseRequest: AgentChatRequest,
    sourceContextPack: SourceContextPackPreparation,
    planGroups: SourceContextMapPlanGroup[],
  ): Promise<SourceContextMapRunDetail> {
    return await this.requestEngine<SourceContextMapRunDetail>({
      kind: "createOrResumeSourceContextMapRun",
      payload: {
        ...(baseRequest.sessionId === undefined ? {} : { sessionId: baseRequest.sessionId }),
        ownerRunId: baseRequest.runId,
        mode: sourceContextPack.options.mode,
        planSignature: sourceContextMapPlanSignature(baseRequest, sourceContextPack, planGroups),
        maxConcurrentMaps: sourceContextMapReduceConcurrencyLimit(sourceContextPack.options),
        steps: planGroups.map((planGroup) => planGroup.stepPlan),
      },
    });
  }

  private async executeSourceContextMapSchedulerSteps(
    run: HostedAgentRun,
    baseRequest: AgentChatRequest,
    sourceContextPack: SourceContextPackPreparation,
    schedulerRunId: string,
    planGroups: SourceContextMapPlanGroup[],
    resultsByGroupIndex: Map<number, SourceContextMapResult>,
  ) {
    const planGroupBySignature = new Map(
      planGroups.map((planGroup) => [planGroup.stepPlan.stepSignature, planGroup] as const),
    );
    const missingCount = planGroups.length - resultsByGroupIndex.size;
    if (missingCount <= 0) return;

    let firstError: unknown;
    const workerCount = Math.min(
      missingCount,
      sourceContextMapReduceConcurrencyLimit(sourceContextPack.options),
    );
    const runWorker = async () => {
      while (
        firstError === undefined &&
        !run.abortController.signal.aborted &&
        resultsByGroupIndex.size < planGroups.length
      ) {
        const claim = await this.requestEngine<SourceContextMapClaimStepResult>({
          kind: "claimSourceContextMapStep",
          runId: schedulerRunId,
        });
        if (claim.step === undefined) return;
        const planGroup = planGroupBySignature.get(claim.step.stepSignature);
        if (planGroup === undefined) {
          const error = new SourceContextMapReduceStageError(
            "map",
            `Map scheduler claimed an unknown step: ${claim.step.id}.`,
          );
          firstError ??= error;
          await this.requestEngine<SourceContextMapStepRecord>({
            kind: "failSourceContextMapStep",
            payload: {
              stepId: claim.step.id,
              errorCode: "PLAN_MISMATCH",
              errorMessage: error.message,
            },
          });
          return;
        }
        if (resultsByGroupIndex.has(planGroup.groupIndex)) continue;
        try {
          const result = await this.executeClaimedSourceContextMapStep(
            run,
            baseRequest,
            sourceContextPack,
            planGroup,
            claim.step,
          );
          resultsByGroupIndex.set(planGroup.groupIndex, result);
        } catch (error) {
          if (run.abortController.signal.aborted) {
            await this.cancelSourceContextMapSchedulerRun(run);
          }
          firstError ??= error;
          return;
        }
      }
    };

    await Promise.all(Array.from({ length: workerCount }, runWorker));
    if (firstError !== undefined) throw firstError;
  }

  private async executeClaimedSourceContextMapStep(
    run: HostedAgentRun,
    baseRequest: AgentChatRequest,
    sourceContextPack: SourceContextPackPreparation,
    planGroup: SourceContextMapPlanGroup,
    step: SourceContextMapStepRecord,
  ): Promise<SourceContextMapResult> {
    if (run.abortController.signal.aborted) throw new Error("Map-reduce was cancelled.");
    this.emitEvent({
      type: "runtime_status",
      runId: baseRequest.runId,
      message: sourceContextMapReduceMapStartedMessage(
        planGroup.group,
        planGroup.groupEvidence,
        planGroup.groupIndex,
        planGroup.groupCount,
      ),
      running: true,
    });
    await this.persistSourceContextMapArtifact(run, {
      stage: "map",
      status: "started",
      groupId: planGroup.groupId,
      groupIndex: planGroup.groupIndex,
      sourceIds: planGroup.stepPlan.sourceIds,
      windowRefs: planGroup.stepPlan.windowRefs,
      evidenceIds: planGroup.stepPlan.evidenceIds,
      tokenEstimate: planGroup.stepPlan.tokenEstimate,
      inputSummary: planGroup.stepPlan.inputSummary,
    });

    const mapRequest = buildSourceContextMapRequest({
      baseRequest,
      group: planGroup.group,
      groupEvidence: planGroup.groupEvidence,
      groupIndex: planGroup.groupIndex,
      options: sourceContextPack.options,
    });
    let result: SourceContextMapResult;
    try {
      result = await this.runSourceContextMapRequest(
        run,
        mapRequest,
        planGroup.group,
        planGroup.groupEvidence,
        planGroup.groupIndex,
      );
    } catch (error) {
      if (run.abortController.signal.aborted) throw error;
      const providerError = providerErrorFromUnknown(error);
      await this.persistSourceContextMapArtifact(run, {
        stage: "map",
        status: "failed",
        groupId: planGroup.groupId,
        groupIndex: planGroup.groupIndex,
        sourceIds: planGroup.stepPlan.sourceIds,
        windowRefs: planGroup.stepPlan.windowRefs,
        evidenceIds: planGroup.stepPlan.evidenceIds,
        tokenEstimate: planGroup.stepPlan.tokenEstimate,
        inputSummary: planGroup.stepPlan.inputSummary,
        errorCode: providerError.code,
        errorMessage: providerError.message,
      });
      await this.requestEngine<SourceContextMapStepRecord>({
        kind: "failSourceContextMapStep",
        payload: {
          stepId: step.id,
          errorCode: providerError.code,
          errorMessage: providerError.message,
        },
      });
      throw error;
    }

    const outputSummary = truncatePromptText(result.text, 1800);
    const artifact = await this.persistSourceContextMapArtifact(run, {
      stage: "map",
      status: "completed",
      groupId: result.groupId,
      groupIndex: planGroup.groupIndex,
      sourceIds: planGroup.stepPlan.sourceIds,
      windowRefs: planGroup.stepPlan.windowRefs,
      evidenceIds: result.evidenceIds,
      tokenEstimate: result.tokenEstimate,
      inputSummary: planGroup.stepPlan.inputSummary,
      outputSummary,
    });
    if (artifact !== undefined) {
      result = { ...result, artifactId: artifact.id };
    }
    await this.requestEngine<SourceContextMapStepRecord>({
      kind: "completeSourceContextMapStep",
      payload: {
        stepId: step.id,
        outputSummary,
        ...(result.artifactId === undefined ? {} : { artifactId: result.artifactId }),
      },
    });
    this.emitEvent({
      type: "runtime_status",
      runId: baseRequest.runId,
      message: sourceContextMapReduceMapCompletedMessage(
        result,
        planGroup.groupIndex,
        planGroup.groupCount,
      ),
      running: true,
    });
    return result;
  }

  private async runSourceContextMapRequest(
    run: HostedAgentRun,
    mapRequest: AgentChatRequest,
    group: SourceContextPackGroup,
    groupEvidence: EvidenceItem[],
    groupIndex: number,
  ): Promise<SourceContextMapResult> {
    let text = "";
    const citations: LocalCitation[] = [];
    for await (const event of this.runtime.streamChat(mapRequest, {
      signal: run.abortController.signal,
    })) {
      if (run.abortController.signal.aborted) {
        throw new Error("Map-reduce was cancelled.");
      }
      if (event.type === "text_delta") {
        text = `${text}${event.delta}`;
        continue;
      }
      if (event.type === "citation") {
        citations.push(event.citation);
        continue;
      }
      if (event.type === "run_failed") {
        throw new SourceContextMapReduceStageError("map", event.error.message, event.error);
      }
      if (event.type === "run_cancelled") {
        run.abortController.abort();
        throw new Error(event.reason ?? "Map-reduce was cancelled.");
      }
      if (event.type === "run_completed") {
        return {
          groupId: sourceContextGroupId(group, groupIndex),
          text: text.trim(),
          citations,
          evidenceIds: groupEvidence.map((item) => item.id),
          tokenEstimate: group.tokenEstimate,
        };
      }
    }
    throw new SourceContextMapReduceStageError("map", "Map provider ended before completion.");
  }

  private async persistSourceContextCompressionLogs(
    run: HostedAgentRun,
    pack: SourceContextPackResult,
  ) {
    if (pack.compressionLog.length === 0) return;
    try {
      await this.requestEngine({
        kind: "appendSourceContextCompressionLogs",
        payload: {
          ...(run.request.sessionId === undefined ? {} : { sessionId: run.request.sessionId }),
          runId: run.request.runId,
          entries: pack.compressionLog,
        },
      });
    } catch {
      this.emitEvent({
        type: "runtime_status",
        runId: run.request.runId,
        message: "Source context compression log was not saved.",
      });
    }
  }

  private async persistSourceContextMapArtifact(
    run: HostedAgentRun,
    entry: SourceContextMapArtifactEntry,
  ): Promise<SourceContextMapArtifactRecord | undefined> {
    try {
      const result = await this.requestEngine<{ items: SourceContextMapArtifactRecord[] }>({
        kind: "appendSourceContextMapArtifacts",
        payload: {
          ...(run.request.sessionId === undefined ? {} : { sessionId: run.request.sessionId }),
          runId: run.request.runId,
          entries: [entry],
        },
      });
      return result.items[0];
    } catch {
      this.emitEvent({
        type: "runtime_status",
        runId: run.request.runId,
        message: "Source context map artifact was not saved.",
      });
      return undefined;
    }
  }

  private async persistSourceContextReduceArtifact(
    run: HostedAgentRun,
    entry: SourceContextMapArtifactEntry,
  ): Promise<SourceContextMapArtifactRecord | undefined> {
    if (entry.mapArtifactIds === undefined || entry.mapArtifactIds.length === 0) return undefined;
    const artifact = await this.persistSourceContextMapArtifact(run, entry);
    await this.persistSourceContextMapReduceSchedulerState(run, entry, artifact?.id);
    return artifact;
  }

  private async persistSourceContextMapReduceSchedulerState(
    run: HostedAgentRun,
    entry: SourceContextMapArtifactEntry,
    artifactId?: string,
  ) {
    const schedulerRunId = run.sourceContextMapSchedulerRunId;
    if (schedulerRunId === undefined || entry.stage !== "reduce") return;
    try {
      if (entry.status === "started") {
        await this.requestEngine({
          kind: "markSourceContextMapReduceStarted",
          payload: {
            runId: schedulerRunId,
            mapArtifactIds: entry.mapArtifactIds,
            inputSummary: entry.inputSummary,
            tokenEstimate: entry.tokenEstimate,
          },
        });
        return;
      }
      if (entry.status === "completed") {
        await this.requestEngine({
          kind: "markSourceContextMapReduceCompleted",
          payload: {
            runId: schedulerRunId,
            outputSummary: entry.outputSummary,
            ...(artifactId === undefined ? {} : { artifactId }),
          },
        });
        return;
      }
      if (entry.errorCode === "CANCELLED") {
        await this.cancelSourceContextMapSchedulerRun(run);
        return;
      }
      await this.requestEngine({
        kind: "markSourceContextMapReduceFailed",
        payload: {
          runId: schedulerRunId,
          errorCode: entry.errorCode,
          errorMessage: entry.errorMessage ?? "Source context reduce failed.",
        },
      });
    } catch {
      this.emitEvent({
        type: "runtime_status",
        runId: run.request.runId,
        message: "Source context map scheduler state was not saved.",
      });
    }
  }

  private async cancelSourceContextMapSchedulerRun(run: HostedAgentRun) {
    const schedulerRunId = run.sourceContextMapSchedulerRunId;
    if (schedulerRunId === undefined) return;
    try {
      await this.requestEngine({
        kind: "cancelSourceContextMapRun",
        id: schedulerRunId,
      });
    } catch {
      this.emitEvent({
        type: "runtime_status",
        runId: run.request.runId,
        message: "Source context map scheduler cancel was not saved.",
      });
    }
  }

  private async pumpManualCompact(run: HostedManualCompactRun) {
    try {
      if (run.sessionId === undefined || this.compactionRuntime === undefined) {
        this.emitEvent({
          type: "run_resolved",
          runId: run.runId,
          message: run.sessionId === undefined ? "Nothing to compact yet" : "Compact failed",
        });
        return;
      }

      const session = await this.requestEngine<ChatSessionDetail | null>({
        kind: "loadChatSession",
        sessionId: run.sessionId,
      });
      if (session === null) {
        this.emitEvent({
          type: "run_resolved",
          runId: run.runId,
          message: "Nothing to compact yet",
        });
        return;
      }

      const latestCompaction = await this.requestEngine<CompactionRecord | null>({
        kind: "getLatestCompaction",
        sessionId: run.sessionId,
      });
      this.emitEvent({
        type: "runtime_status",
        runId: run.runId,
        message: "Compacting...",
        running: true,
      });
      const outcome = await this.compactionRuntime.compact({
        session,
        latestCompaction,
        signal: run.abortController.signal,
      });
      if (run.abortController.signal.aborted) {
        this.emitEvent({
          type: "run_resolved",
          runId: run.runId,
          message: "Stopped.",
        });
        return;
      }
      if (outcome.status === "noop") {
        this.emitEvent({
          type: "run_resolved",
          runId: run.runId,
          message: "Nothing to compact yet",
        });
        return;
      }

      await this.requestEngine<CompactionRecord>({
        kind: "appendCompaction",
        payload: outcome.payload,
      });
      this.emitEvent({
        type: "run_resolved",
        runId: run.runId,
        message: run.abortController.signal.aborted ? "Stopped." : "Compacted",
      });
    } catch {
      if (run.abortController.signal.aborted) {
        this.emitEvent({
          type: "run_resolved",
          runId: run.runId,
          message: "Stopped.",
        });
        return;
      }
      this.emitEvent({
        type: "run_resolved",
        runId: run.runId,
        message: "Compact failed",
      });
    } finally {
      this.activeManualCompactions.delete(run.runId);
    }
  }

  private async resolveContextTooLarge(run: HostedAgentRun) {
    await this.deleteAssistantPlaceholder(run);
    this.emitEvent({
      type: "run_resolved",
      runId: run.request.runId,
      message: "Context too large",
      removeAssistantMessageId: run.request.assistantMessageId,
    });
  }

  private async resolvePreProviderStop(run: HostedAgentRun) {
    const { sessionId } = run.request;
    if (sessionId !== undefined) {
      await this.requestEngine<{ cleared: number }>({
        kind: "clearQueuedChatMessages",
        sessionId,
      }).catch(() => ({ cleared: 0 }));
    }
    await this.deleteAssistantPlaceholder(run);
    this.emitEvent({
      type: "run_resolved",
      runId: run.request.runId,
      message: "Stopped.",
      removeAssistantMessageId: run.request.assistantMessageId,
    });
  }

  private async deleteAssistantPlaceholder(run: HostedAgentRun) {
    const { sessionId, assistantMessageId } = run.request;
    if (sessionId === undefined || assistantMessageId === undefined) return;
    await this.requestEngine<{ deleted: boolean }>({
      kind: "deleteChatMessage",
      sessionId,
      messageId: assistantMessageId,
    }).catch(() => ({ deleted: false }));
  }

  private async startNextQueuedFollowUp(completedRun: HostedAgentRun) {
    const { sessionId } = completedRun.request;
    if (sessionId === undefined) return;

    const session = await this.requestEngine<ChatSessionDetail | null>({
      kind: "loadChatSession",
      sessionId,
    });
    if (session === null) return;

    const queuedUser = findNextQueuedUserMessage(session.messages);
    if (queuedUser === undefined) return;

    const now = new Date().toISOString();
    const runId = queuedUser.runId ?? runIdFromQueuedUserMessage(queuedUser);
    if (this.activeRuns.has(runId)) return;

    const evidence =
      queuedUser.scope === "general" ? [] : session.evidence.map(sessionEvidenceToAgentEvidence);
    const evidenceRefs = evidence.map((item) => item.id);
    const pageUrl = queuedUser.pageUrl ?? completedRun.request.pageUrl;
    const pageTitle = queuedUser.pageTitle ?? completedRun.request.pageTitle;
    const assistantMessageId = `${runId}:assistant`;
    const currentTurnEvidenceRefs = queuedUser.evidenceRefs;
    const providerQuestion = providerQuestionFromMessage(queuedUser);
    const sourceContextPack = sourceContextPackFromMessage(queuedUser);

    await this.requestEngine<ChatMessageRecord>({
      kind: "updateChatMessage",
      payload: {
        id: queuedUser.id,
        sessionId,
        status: "completed",
        evidenceRefs,
        updatedAt: now,
      },
    });
    await this.requestEngine<ChatMessageRecord>({
      kind: "upsertChatMessage",
      payload: {
        id: assistantMessageId,
        sessionId,
        role: "assistant",
        status: "streaming",
        content: "",
        scope: queuedUser.scope,
        pageUrl,
        pageTitle,
        selectionText: queuedUser.selectionText,
        evidenceRefs,
        retry: {
          question: providerQuestion,
          scope: queuedUser.scope,
          pageUrl,
          selectionText: queuedUser.selectionText,
          evidenceRevision: session.currentEvidenceRevision,
          ...(sourceContextPack === undefined ? {} : { sourceContextPack }),
        },
        runId,
        createdAt: now,
        updatedAt: now,
        piAgentMessageJson: {
          role: "assistant",
          content: "",
          timestamp: Date.parse(now) || Date.now(),
        },
      },
    });

    const nextRun: HostedAgentRun = {
      request: {
        runId,
        sessionId,
        userMessageId: queuedUser.id,
        assistantMessageId,
        evidenceRevision: session.currentEvidenceRevision,
        question: providerQuestion,
        scope: queuedUser.scope,
        pageUrl,
        pageTitle,
        evidence,
        currentTurnEvidenceRefs,
        ...(sourceContextPack === undefined ? {} : { sourceContextPack }),
        createdAt: now,
      },
      abortController: new AbortController(),
      providerStarted: false,
      citations: [],
      citationRepairCount: 0,
      worldKnowledge: [],
      content: "",
    };
    this.activeRuns.set(runId, nextRun);
    void this.pump(nextRun);
  }

  private async buildCitationValidationEvent(
    run: HostedAgentRun,
  ): Promise<Extract<AgentStreamEvent, { type: "citation_validation" }>> {
    const input = {
      evidence: citationEvidenceForRequest(run.request),
      citations: run.citations,
      content: run.content,
      question: run.request.question,
      retry:
        run.citationRepairCount === 0
          ? undefined
          : {
              attempted: true,
              count: run.citationRepairCount,
              exhausted: false,
              reason: run.citationRepairReason,
            },
    };
    try {
      const semanticInput = buildSemanticCitationJudgeInput(input);
      const semanticJudge =
        semanticInput === undefined
          ? undefined
          : await this.evaluateSemanticCitationJudge(semanticInput, run);
      const validation = validateCitationCoverage({
        ...input,
        semanticJudge,
        semanticJudgeRequired: semanticInput !== undefined,
      });
      return {
        type: "citation_validation",
        runId: run.request.runId,
        validation:
          run.citationRepairCount === 0 || validation.status === "valid"
            ? validation
            : withCitationRetryExhausted(validation, run),
      };
    } catch {
      return {
        type: "citation_validation",
        runId: run.request.runId,
        validation: citationValidatorErrorResult(input),
      };
    }
  }

  private async evaluateSemanticCitationJudge(
    input: NonNullable<ReturnType<typeof buildSemanticCitationJudgeInput>>,
    run: HostedAgentRun,
  ): Promise<SemanticCitationJudgeResult> {
    if (this.semanticCitationJudge === undefined) {
      return {
        status: "unavailable",
        checkedClaimCount: input.claims.length,
        unsupportedClaimIds: [],
        providerKind: "chat",
        reason: "semantic_judge_not_configured",
      };
    }
    return this.semanticCitationJudge.judge(input, { signal: run.abortController.signal });
  }

  private shouldRepairCitationValidation(
    run: HostedAgentRun,
    validation: CitationValidationResult,
  ) {
    return (
      validation.status === "warning" &&
      run.citationRepairCount === 0 &&
      !run.abortController.signal.aborted &&
      validation.memoryEvidenceCount > 0 &&
      isRepairableCitationValidationReason(validation.reason)
    );
  }

  private async startCitationRepair(run: HostedAgentRun, validation: CitationValidationResult) {
    run.citationRepairCount += 1;
    run.citationRepairReason = validation.reason;
    const event: AgentStreamEvent = {
      type: "citation_repair_started",
      runId: run.request.runId,
      reason: validation.reason,
      attempt: run.citationRepairCount,
      message: citationRepairStartedMessage(validation),
    };
    await this.persistEvent(run, event);
    this.emitEvent(event);
    run.request = {
      ...run.request,
      question: buildCitationRepairPrompt(run.request, run.content, validation),
      createdAt: new Date().toISOString(),
    };
  }

  private async persistEvent(run: HostedAgentRun, event: AgentStreamEvent) {
    const { sessionId, assistantMessageId } = run.request;
    if (sessionId === undefined || assistantMessageId === undefined) return;

    if (event.type === "citation_repair_started") {
      run.content = "";
      run.citations = [];
      run.citationValidation = undefined;
      const updatedAt = new Date().toISOString();
      await this.requestEngine<ChatMessageRecord>({
        kind: "updateChatMessage",
        payload: {
          id: assistantMessageId,
          sessionId,
          content: "",
          citations: [],
          status: "streaming",
          clearError: true,
          piAgentMessageJson: assistantPiAgentMessageJson("", updatedAt),
          updatedAt,
        },
      });
      return;
    }
    if (event.type === "text_delta") {
      run.content = `${run.content}${event.delta}`;
      const updatedAt = new Date().toISOString();
      await this.requestEngine<ChatMessageRecord>({
        kind: "updateChatMessage",
        payload: {
          id: assistantMessageId,
          sessionId,
          appendContent: event.delta,
          status: "streaming",
          piAgentMessageJson: assistantPiAgentMessageJson(
            run.content,
            updatedAt,
            run.citationValidation,
          ),
          updatedAt,
        },
      });
      return;
    }
    if (event.type === "citation") {
      run.citations.push(event.citation);
      await this.requestEngine<ChatMessageRecord>({
        kind: "updateChatMessage",
        payload: {
          id: assistantMessageId,
          sessionId,
          citations: run.citations,
          updatedAt: new Date().toISOString(),
        },
      });
      return;
    }
    if (event.type === "world_knowledge") {
      if (!run.worldKnowledge.includes(event.note)) {
        run.worldKnowledge.push(event.note);
      }
      await this.requestEngine<ChatMessageRecord>({
        kind: "updateChatMessage",
        payload: {
          id: assistantMessageId,
          sessionId,
          worldKnowledge: run.worldKnowledge,
          updatedAt: new Date().toISOString(),
        },
      });
      return;
    }
    if (event.type === "citation_validation") {
      run.citationValidation = event.validation;
      const updatedAt = new Date().toISOString();
      await this.requestEngine<ChatMessageRecord>({
        kind: "updateChatMessage",
        payload: {
          id: assistantMessageId,
          sessionId,
          piAgentMessageJson: assistantPiAgentMessageJson(run.content, updatedAt, event.validation),
          updatedAt,
        },
      });
      return;
    }
    if (event.type === "run_completed") {
      const updatedAt = new Date().toISOString();
      await this.requestEngine<ChatMessageRecord>({
        kind: "updateChatMessage",
        payload: {
          id: assistantMessageId,
          sessionId,
          status: "completed",
          piAgentMessageJson: assistantPiAgentMessageJson(
            run.content,
            updatedAt,
            run.citationValidation,
          ),
          updatedAt,
        },
      });
      return;
    }
    if (event.type === "run_failed") {
      const updatedAt = new Date().toISOString();
      await this.requestEngine<ChatMessageRecord>({
        kind: "updateChatMessage",
        payload: {
          id: assistantMessageId,
          sessionId,
          status: event.error.code === "PROVIDER_INTERRUPTED" ? "interrupted" : "failed",
          error: event.error,
          piAgentMessageJson: assistantPiAgentMessageJson(
            run.content,
            updatedAt,
            run.citationValidation,
          ),
          updatedAt,
        },
      });
      return;
    }
    if (event.type === "run_cancelled") {
      const updatedAt = new Date().toISOString();
      await this.requestEngine<ChatMessageRecord>({
        kind: "updateChatMessage",
        payload: {
          id: assistantMessageId,
          sessionId,
          status: "cancelled",
          error: {
            code: "CANCELLED",
            message: event.reason ?? "Response stopped.",
          },
          clearRetry: true,
          piAgentMessageJson: assistantPiAgentMessageJson(
            run.content,
            updatedAt,
            run.citationValidation,
          ),
          updatedAt,
        },
      });
    }
  }
}

function assistantPiAgentMessageJson(
  content: string,
  at: string,
  validation?: CitationValidationResult,
) {
  return {
    role: "assistant",
    content,
    timestamp: Date.parse(at) || Date.now(),
    ...(validation === undefined ? {} : { clioCitationValidation: validation }),
  };
}

function isRepairableCitationValidationReason(reason: CitationValidationReason) {
  return (
    reason === "missing_memory_citation" ||
    reason === "missing_memory_claim_citation" ||
    reason === "invalid_citation" ||
    reason === "unsupported_memory_claim" ||
    reason === "insufficient_memory_evidence" ||
    reason === "semantic_judge_unavailable" ||
    reason === "semantic_judge_error"
  );
}

function withCitationRetryExhausted(
  validation: CitationValidationResult,
  run: HostedAgentRun,
): CitationValidationResult {
  return {
    ...validation,
    retry: {
      attempted: true,
      count: run.citationRepairCount,
      exhausted: validation.status === "warning",
      reason: run.citationRepairReason,
    },
  };
}

function citationRepairStartedMessage(validation: CitationValidationResult) {
  return `Repairing local citations: ${validation.reason}.`;
}

function buildCitationRepairPrompt(
  request: AgentChatRequest,
  previousAnswer: string,
  validation: CitationValidationResult,
) {
  const evidence = citationEvidenceForRequest(request).filter(
    (item) => item.sourceKind === "memory",
  );
  const claimPreviews =
    validation.uncoveredClaims === undefined || validation.uncoveredClaims.length === 0
      ? "none"
      : validation.uncoveredClaims
          .slice(0, 5)
          .map((claim, index) => `${index + 1}. ${claim.reason}: ${claim.text}`)
          .join("\n");
  const semantic =
    validation.semanticJudge === undefined
      ? "not_run"
      : [
          `status=${validation.semanticJudge.status}`,
          `checked=${validation.semanticJudge.checkedClaimCount}`,
          `unsupported=${validation.semanticJudge.unsupportedClaimCount}`,
          validation.semanticJudge.reason === undefined
            ? undefined
            : `reason=${validation.semanticJudge.reason}`,
        ]
          .filter((item): item is string => item !== undefined)
          .join("; ");

  return [
    "Repair the previous answer so every factual local-knowledge claim is supported by exact citation ids.",
    "Use only the bounded evidence blocks already attached to this request.",
    "Do not use web search, outside knowledge, full documents, or any unlisted citation id.",
    "If the evidence does not support a claim, remove or narrow that claim.",
    "",
    `Original question: ${truncatePromptText(originalQuestionForRepair(request.question), 700)}`,
    "",
    "Previous answer excerpt:",
    truncatePromptText(previousAnswer, 1000) || "none",
    "",
    `Validation reason: ${validation.reason}`,
    `Evidence quality: ${validation.evidenceQuality ?? "unknown"}`,
    `Claims: total=${validation.claimCount ?? 0}, covered=${validation.coveredClaimCount ?? 0}, unresolved=${validation.uncoveredClaimCount ?? 0}`,
    `Semantic judge: ${semantic}`,
    "",
    "Unresolved claim previews:",
    claimPreviews,
    "",
    "Available local evidence ids:",
    evidence.length === 0
      ? "none"
      : evidence
          .slice(0, 8)
          .map((item) => `- ${item.id} (${truncatePromptText(item.sourceTitle, 120)})`)
          .join("\n"),
  ].join("\n");
}

function originalQuestionForRepair(question: string) {
  const marker = "Original question:";
  const index = question.indexOf(marker);
  if (index < 0) return question;
  const rest = question.slice(index + marker.length).trim();
  const lineEnd = rest.indexOf("\n");
  return lineEnd < 0 ? rest : rest.slice(0, lineEnd).trim();
}

function truncatePromptText(input: string, maxChars: number) {
  const text = input.replace(/\s+/g, " ").trim();
  if (text.length <= maxChars) return text;
  if (maxChars <= 3) return text.slice(0, maxChars);
  return `${text.slice(0, maxChars - 3).trimEnd()}...`;
}

function citationEvidenceForRequest(request: AgentChatRequest) {
  return request.providerContext?.evidence ?? request.evidence;
}

function sourceContextPackPayload(request: AgentChatRequest): BuildSourceContextPackPayload {
  const options = request.sourceContextPack;
  const defaults = sourceContextPackBudgetDefaults(options);
  const sourceIds = options?.sourceIds;
  return {
    query: request.question,
    ...(sourceIds === undefined ? {} : { sourceIds }),
    ...(options?.sourceDepthOverrides === undefined
      ? {}
      : { sourceDepthOverrides: options.sourceDepthOverrides }),
    useWorkingSet: options?.useWorkingSet ?? sourceIds === undefined,
    maxTotalTokens: options?.maxTotalTokens ?? defaults.maxTotalTokens,
    maxGroups: options?.maxGroups ?? defaults.maxGroups,
    maxGroupTokens: options?.maxGroupTokens ?? defaults.maxGroupTokens,
    maxSources: options?.maxSources ?? defaults.maxSources,
    maxWindowsPerSource: options?.maxWindowsPerSource ?? defaults.maxWindowsPerSource,
    contextChunksBefore: options?.contextChunksBefore ?? defaults.contextChunksBefore,
    contextChunksAfter: options?.contextChunksAfter ?? defaults.contextChunksAfter,
  };
}

function sourceContextPackBudgetDefaults(options: AgentChatRequest["sourceContextPack"]) {
  return options?.mode === "auto"
    ? sourceContextPackAutoBudgetDefaults
    : sourceContextPackResearchBudgetDefaults;
}

function sourceContextPackToEvidence(pack: SourceContextPackResult): EvidenceItem[] {
  const seen = new Set<string>();
  return pack.groups.flatMap((group) =>
    group.windows.flatMap((window) => {
      const evidence = sourceContextWindowToEvidence(window);
      if (seen.has(evidence.id)) return [];
      seen.add(evidence.id);
      return [evidence];
    }),
  );
}

function sourceContextWindowToEvidence(window: SourceContextPackWindow): EvidenceItem {
  const text = compactEvidenceText(window.text);
  return {
    id: `memory:${window.sourceId}:chunk:${window.chunkId}`,
    sourceKind: "memory",
    sourceUrl: window.sourceUrl,
    sourceTitle: window.sourceTitle,
    text,
    excerpt: excerptEvidenceText(text),
    ...(window.anchor === undefined
      ? {}
      : {
          anchor: {
            selectedText: window.anchor.selectedText,
            contextBefore: window.anchor.contextBefore,
            contextAfter: window.anchor.contextAfter,
            ...(window.anchor.xpath === undefined ? {} : { xpath: window.anchor.xpath }),
            ...(window.anchor.textFragment === undefined
              ? {}
              : { textFragment: window.anchor.textFragment }),
          },
        }),
  };
}

function mergeEvidence(existing: EvidenceItem[], next: EvidenceItem[]) {
  const byId = new Map(existing.map((item) => [item.id, item]));
  for (const item of next) {
    byId.set(item.id, item);
  }
  return Array.from(byId.values());
}

function sourceContextPackStatusMessage(pack: SourceContextPackResult, evidenceCount: number) {
  const sourceCount = pack.sources.length;
  const groupCount = pack.groups.length;
  const groupIds = sourceContextPackGroupIdSummary(pack);
  const depths = sourceContextPackDepthSummary(pack);
  const prefix =
    `Loaded source context: ${sourceCount} source(s), ` +
    `${groupCount} group(s), ${evidenceCount} window(s)`;
  if (pack.compressionLog.length === 0) {
    return `${prefix}; groups ${groupIds}; depths ${depths}.`;
  }
  const reasons = Array.from(new Set(pack.compressionLog.map((entry) => entry.reason))).join(", ");
  return `${prefix}; groups ${groupIds}; depths ${depths}; adjusted ${reasons}.`;
}

function sourceContextPackExecutableGroups(preparation: SourceContextPackPreparation) {
  const groupLimit = sourceContextMapReduceGroupLimit(preparation.options);
  if (groupLimit <= 0) return [];
  return preparation.pack.groups
    .filter((group) => sourceContextGroupToEvidence(group).length > 0)
    .slice(0, groupLimit);
}

function sourceContextMapPlanGroups(
  baseRequest: AgentChatRequest,
  preparation: SourceContextPackPreparation,
): SourceContextMapPlanGroup[] {
  const groups = sourceContextPackExecutableGroups(preparation);
  return groups.map((group, groupIndex) => {
    const groupEvidence = sourceContextGroupToEvidence(group);
    const groupId = sourceContextGroupId(group, groupIndex);
    const windowRefs = sourceContextMapArtifactWindowRefs(group);
    const evidenceIds = groupEvidence.map((item) => item.id);
    const inputSummary = sourceContextMapArtifactInputSummary(group, groupEvidence, groupIndex);
    const stepPlan: SourceContextMapStepPlan = {
      groupId,
      groupIndex,
      sourceIds: group.sourceIds,
      windowRefs,
      evidenceIds,
      tokenEstimate: group.tokenEstimate,
      inputSummary,
      stepSignature: sourceContextMapStepSignature(baseRequest, preparation.options, {
        groupId,
        groupIndex,
        sourceIds: group.sourceIds,
        windowRefs,
        evidenceIds,
        tokenEstimate: group.tokenEstimate,
      }),
    };
    return {
      group,
      groupEvidence,
      groupId,
      groupIndex,
      groupCount: groups.length,
      stepPlan,
    };
  });
}

function sourceContextMapPlanSignature(
  baseRequest: AgentChatRequest,
  preparation: SourceContextPackPreparation,
  planGroups: SourceContextMapPlanGroup[],
) {
  return sourceContextMapSignature("plan", {
    version: 1,
    ownerRunId: baseRequest.runId,
    questionHash: hashText(baseRequest.question),
    mode: preparation.options.mode,
    mapReduce: sourceContextMapReduceSignatureOptions(preparation.options),
    steps: planGroups.map((planGroup) => planGroup.stepPlan.stepSignature),
  });
}

function sourceContextMapStepSignature(
  baseRequest: AgentChatRequest,
  options: NonNullable<AgentChatRequest["sourceContextPack"]>,
  input: Pick<
    SourceContextMapStepPlan,
    "groupId" | "groupIndex" | "sourceIds" | "windowRefs" | "evidenceIds" | "tokenEstimate"
  >,
) {
  return sourceContextMapSignature("step", {
    version: 1,
    questionHash: hashText(baseRequest.question),
    mode: options.mode,
    mapReduce: sourceContextMapReduceSignatureOptions(options),
    ...input,
  });
}

function sourceContextMapSignature(kind: "plan" | "step", value: unknown) {
  return `source-context-map-${kind}-v1:${hashText(JSON.stringify(value))}`;
}

function sourceContextMapReduceSignatureOptions(
  options: NonNullable<AgentChatRequest["sourceContextPack"]>,
) {
  return {
    enabled: options.mapReduce?.enabled === true,
    maxGroups: sourceContextMapReduceGroupLimit(options),
    perGroupTokenBudget: sourceContextMapReduceTokenBudget(options),
    maxConcurrentMaps: sourceContextMapReduceConcurrencyLimit(options),
  };
}

function sourceContextMapReduceConcurrencyLimit(
  options: NonNullable<AgentChatRequest["sourceContextPack"]>,
) {
  const rawLimit = options.mapReduce?.maxConcurrentMaps ?? 1;
  if (!Number.isFinite(rawLimit) || rawLimit <= 0) return 1;
  return Math.max(1, Math.min(4, Math.floor(rawLimit)));
}

function sourceContextMapResultFromCompletedStep(
  planGroup: SourceContextMapPlanGroup,
  step: SourceContextMapStepRecord,
): SourceContextMapResult {
  return {
    groupId: planGroup.groupId,
    text: step.outputSummary ?? "",
    citations: [],
    evidenceIds: step.evidenceIds,
    tokenEstimate: step.tokenEstimate,
    ...(step.artifactId === undefined ? {} : { artifactId: step.artifactId }),
  };
}

function sourceContextMapReduceGroupLimit(
  options: NonNullable<AgentChatRequest["sourceContextPack"]>,
) {
  const defaults = sourceContextPackBudgetDefaults(options);
  const rawLimit = options.mapReduce?.maxGroups ?? options.maxGroups ?? defaults.maxGroups;
  if (!Number.isFinite(rawLimit) || rawLimit <= 0) return 0;
  return Math.floor(rawLimit);
}

function sourceContextMapReduceTokenBudget(
  options: NonNullable<AgentChatRequest["sourceContextPack"]>,
) {
  const defaults = sourceContextPackBudgetDefaults(options);
  const rawBudget =
    options.mapReduce?.perGroupTokenBudget ?? options.maxGroupTokens ?? defaults.maxGroupTokens;
  if (!Number.isFinite(rawBudget) || rawBudget <= 0) return defaults.maxGroupTokens;
  return Math.floor(rawBudget);
}

function sourceContextGroupToEvidence(group: SourceContextPackGroup): EvidenceItem[] {
  const seen = new Set<string>();
  return group.windows.flatMap((window) => {
    const evidence = sourceContextWindowToEvidence(window);
    if (seen.has(evidence.id)) return [];
    seen.add(evidence.id);
    return [evidence];
  });
}

function sourceContextGroupId(group: SourceContextPackGroup, groupIndex: number) {
  const id = group.id.trim();
  return id.length > 0 ? id : `group-${groupIndex + 1}`;
}

function sourceContextMapArtifactWindowRefs(group: SourceContextPackGroup) {
  return group.windows.map((window) => ({
    sourceId: window.sourceId,
    chunkId: window.chunkId,
    ord: window.ord,
  }));
}

function sourceContextMapArtifactInputSummary(
  group: SourceContextPackGroup,
  evidence: EvidenceItem[],
  groupIndex: number,
) {
  return (
    `group=${sourceContextGroupId(group, groupIndex)}; ` +
    `sources=${group.sourceIds.length}; windows=${group.windows.length}; ` +
    `evidence=${evidence.length}; tokens=${group.tokenEstimate}`
  );
}

function sourceContextMapArtifactIds(mapResults: SourceContextMapResult[]) {
  return mapResults.flatMap((result) =>
    result.artifactId === undefined ? [] : [result.artifactId],
  );
}

function sourceContextReduceArtifactInputSummary(mapResults: SourceContextMapResult[]) {
  const tokenEstimate = mapResults.reduce((total, result) => total + result.tokenEstimate, 0);
  return `map artifacts=${sourceContextMapArtifactIds(mapResults).length}; groups=${mapResults.length}; tokens=${tokenEstimate}`;
}

function buildSourceContextMapRequest(input: {
  baseRequest: AgentChatRequest;
  group: SourceContextPackGroup;
  groupEvidence: EvidenceItem[];
  groupIndex: number;
  options: NonNullable<AgentChatRequest["sourceContextPack"]>;
}) {
  const groupId = sourceContextGroupId(input.group, input.groupIndex);
  return withRequestEvidence(
    {
      ...input.baseRequest,
      runId: sourceContextMapRunId(input.baseRequest.runId, groupId, input.groupIndex),
      question: buildSourceContextMapPrompt(input),
      createdAt: new Date().toISOString(),
    },
    input.groupEvidence,
  );
}

function buildSourceContextReduceRequest(
  baseRequest: AgentChatRequest,
  sourceContextPack: SourceContextPackPreparation,
  mapResults: SourceContextMapResult[],
) {
  const evidence = sourceContextSinglePassEvidence(baseRequest, sourceContextPack.evidence);
  return withRequestEvidence(
    {
      ...baseRequest,
      question: buildSourceContextReducePrompt(baseRequest.question, mapResults),
      createdAt: new Date().toISOString(),
    },
    evidence,
  );
}

function sourceContextSinglePassRequest(
  request: AgentChatRequest,
  sourceContextEvidence: EvidenceItem[],
) {
  return withRequestEvidence(
    request,
    sourceContextSinglePassEvidence(request, sourceContextEvidence),
  );
}

function sourceContextSinglePassEvidence(
  request: AgentChatRequest,
  sourceContextEvidence: EvidenceItem[],
) {
  return mergeEvidence(citationEvidenceForRequest(request), sourceContextEvidence);
}

function withRequestEvidence(
  request: AgentChatRequest,
  evidence: EvidenceItem[],
): AgentChatRequest {
  if (request.providerContext === undefined) {
    return {
      ...request,
      evidence,
    };
  }
  return {
    ...request,
    evidence,
    providerContext: {
      ...request.providerContext,
      evidence,
    },
  };
}

function buildSourceContextMapPrompt(input: {
  baseRequest: AgentChatRequest;
  group: SourceContextPackGroup;
  groupEvidence: EvidenceItem[];
  groupIndex: number;
  options: NonNullable<AgentChatRequest["sourceContextPack"]>;
}) {
  const groupId = sourceContextGroupId(input.group, input.groupIndex);
  const tokenBudget = sourceContextMapReduceTokenBudget(input.options);
  return [
    "Analyze only this bounded source context group for the original question.",
    "Return concise findings grounded in this group's evidence.",
    "Use citation markers with exact evidence ids when making factual claims.",
    "Do not use outside knowledge, full documents, other groups, or unlisted citation ids.",
    `Group: ${groupId}; source count=${input.group.sourceIds.length}; ` +
      `window count=${input.group.windows.length}; token estimate=${input.group.tokenEstimate}; ` +
      `group token budget=${tokenBudget}.`,
    "",
    "Available evidence ids:",
    evidenceIdList(input.groupEvidence),
    "",
    "Original question:",
    truncatePromptText(input.baseRequest.question, 1200),
  ].join("\n");
}

function buildSourceContextReducePrompt(
  originalQuestion: string,
  mapResults: SourceContextMapResult[],
) {
  return [
    "Synthesize the bounded group analyses into the final answer.",
    "Use only the concrete source evidence attached to this request for citation markers.",
    "Cite only original evidence ids from the attached evidence blocks; do not cite group ids or map summaries.",
    "Do not use outside knowledge, full documents, or unlisted citation ids.",
    "",
    "Original question:",
    truncatePromptText(originalQuestion, 1200),
    "",
    "Group analyses:",
    mapResults
      .map((result, index) =>
        [
          `${index + 1}. ${result.groupId}; token estimate=${result.tokenEstimate}; ` +
            `evidence ids=${result.evidenceIds.join(", ") || "none"}; ` +
            `map citation count=${result.citations.length}`,
          truncatePromptText(result.text, 1800) || "No supported findings returned.",
        ].join("\n"),
      )
      .join("\n\n"),
  ].join("\n");
}

function evidenceIdList(evidence: EvidenceItem[]) {
  return evidence.length === 0 ? "none" : evidence.map((item) => `- ${item.id}`).join("\n");
}

function sourceContextMapRunId(runId: string, groupId: string, groupIndex: number) {
  const safeGroupId = groupId.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${runId}:map:${groupIndex + 1}:${(safeGroupId || "group").slice(0, 64)}`;
}

function sourceContextMapReduceMapStartedMessage(
  group: SourceContextPackGroup,
  groupEvidence: EvidenceItem[],
  groupIndex: number,
  groupCount: number,
) {
  return (
    `Map-reduce mapping ${groupIndex + 1}/${groupCount}: ` +
    `${sourceContextGroupId(group, groupIndex)}; ${group.sourceIds.length} source(s), ` +
    `${groupEvidence.length} evidence window(s), ${group.tokenEstimate} token(s).`
  );
}

function sourceContextMapReduceMapCompletedMessage(
  result: SourceContextMapResult,
  groupIndex: number,
  groupCount: number,
) {
  return (
    `Map-reduce mapped ${groupIndex + 1}/${groupCount}: ${result.groupId}; ` +
    `${result.text.length} char(s), ${result.citations.length} citation(s).`
  );
}

function sourceContextMapReduceReduceStartedMessage(mapResults: SourceContextMapResult[]) {
  return `Map-reduce reducing ${mapResults.length} group result(s).`;
}

function sourceContextMapReduceFallbackMessage(stage: "map" | "reduce", error?: AgentErrorInfo) {
  const reason = error?.message?.trim();
  const suffix = reason === undefined || reason.length === 0 ? "" : ` Reason: ${reason}`;
  return `Map-reduce fallback: ${stage} stage failed; using single-pass source context.${suffix}`;
}

function providerErrorFromUnknown(error: unknown): AgentErrorInfo {
  if (error instanceof SourceContextMapReduceStageError && error.providerError !== undefined) {
    return error.providerError;
  }
  return {
    code: "PROVIDER_ERROR",
    message: error instanceof Error ? error.message : String(error),
  };
}

function sourceContextPackMapReducePlanMessage(
  pack: SourceContextPackResult,
  options: NonNullable<AgentChatRequest["sourceContextPack"]>,
) {
  const groupLimit = sourceContextMapReduceGroupLimit(options);
  const tokenBudget = sourceContextMapReduceTokenBudget(options);
  const groupSummaries = pack.groups
    .slice(0, groupLimit)
    .map(
      (group) =>
        `${group.id || "group"}: ${group.sourceIds.length} source(s), ` +
        `${group.tokenEstimate} token(s), ${group.windows.length} window(s)`,
    );
  const suffix = groupSummaries.length === 0 ? "no groups" : groupSummaries.join("; ");
  return `Map-reduce plan: ${pack.groups.length} group(s), ${tokenBudget} token(s)/group; ${suffix}.`;
}

function sourceContextPackGroupIdSummary(pack: SourceContextPackResult) {
  const groupIds = pack.groups.map((group) => group.id).filter((id) => id.length > 0);
  if (groupIds.length === 0) return "none";
  return groupIds.slice(0, 4).join(", ");
}

function sourceContextPackDepthSummary(pack: SourceContextPackResult) {
  const depths = Array.from(
    new Set(
      pack.sources.map((source) => `${source.requestedLoadDepth}->${source.selectedLoadDepth}`),
    ),
  );
  return depths.length === 0 ? "none" : depths.join(", ");
}

function compactEvidenceText(input: string) {
  return input.replace(/\s+/g, " ").trim();
}

function excerptEvidenceText(input: string) {
  const compact = compactEvidenceText(input);
  return compact.length <= 240 ? compact : `${compact.slice(0, 237)}...`;
}

function findNextQueuedUserMessage(messages: ChatMessageRecord[]) {
  return messages
    .filter((message) => message.role === "user" && message.status === "queued")
    .sort((left, right) => {
      const leftOrder = left.queueOrder ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = right.queueOrder ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      return left.createdAt.localeCompare(right.createdAt);
    })[0];
}

function runIdFromQueuedUserMessage(message: ChatMessageRecord) {
  return message.id.endsWith(":user") ? message.id.slice(0, -":user".length) : message.id;
}

function providerQuestionFromMessage(message: ChatMessageRecord) {
  const value = message.piAgentMessageJson?.clioProviderQuestion;
  return typeof value === "string" && value.trim().length > 0 ? value : message.content;
}

function sourceContextPackFromMessage(
  message: ChatMessageRecord,
): AgentChatRequest["sourceContextPack"] | undefined {
  return readSourceContextPackRequestOptions(message.piAgentMessageJson?.clioSourceContextPack);
}

function sessionEvidenceToAgentEvidence(record: SessionEvidenceRecord): EvidenceItem {
  return {
    id: record.id,
    sourceKind: record.sourceKind,
    sourceUrl: record.pageUrl,
    sourceTitle: record.pageTitle,
    text: record.text,
    excerpt: record.excerpt,
  };
}

function isTerminalAgentEvent(event: AgentStreamEvent) {
  return (
    event.type === "run_completed" ||
    event.type === "run_failed" ||
    event.type === "run_cancelled" ||
    event.type === "run_resolved"
  );
}

function isVisibleAssistantAnswerEvent(event: AgentStreamEvent) {
  return (
    event.type === "text_delta" || event.type === "citation" || event.type === "world_knowledge"
  );
}
