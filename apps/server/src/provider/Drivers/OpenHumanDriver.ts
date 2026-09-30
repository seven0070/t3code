import {
  EventId,
  type ModelSelection,
  ProviderDriverKind,
  type ProviderRuntimeEvent,
  type ProviderSendTurnInput,
  type ProviderSession,
  type ProviderSessionStartInput,
  type ServerProvider,
  TextGenerationError,
  ThreadId,
  TurnId,
} from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as PubSub from "effect/PubSub";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http";

import { ProviderAdapterRequestError, type ProviderAdapterError } from "../Errors.ts";
import { recordEvolutionSkill } from "../Layers/OpenHumanEvolution.ts";
import { buildServerProvider } from "../providerSnapshot.ts";
import {
  defaultProviderContinuationIdentity,
  type ProviderDriver,
  type ProviderInstance,
} from "../ProviderDriver.ts";
import type { ServerProviderShape } from "../Services/ServerProvider.ts";
import type { ProviderAdapterShape, ProviderThreadSnapshot } from "../Services/ProviderAdapter.ts";

export const OpenHumanConfig = Schema.Struct({
  enabled: Schema.optional(Schema.Boolean),
  serverUrl: Schema.optional(Schema.String),
});
export type OpenHumanConfig = typeof OpenHumanConfig.Type;

export const DRIVER_KIND = ProviderDriverKind.make("openhuman");

export type OpenHumanDriverEnv = HttpClient.HttpClient | FileSystem.FileSystem | Path.Path;

const nowIso = Effect.map(DateTime.now, DateTime.formatIso);
const decodeJson = HttpClientResponse.schemaBodyJson(Schema.Unknown);

export const OpenHumanDriver: ProviderDriver<OpenHumanConfig, OpenHumanDriverEnv> = {
  driverKind: DRIVER_KIND,
  metadata: {
    displayName: "OpenHuman (J.A.R.V.I.S.)",
    supportsMultipleInstances: false,
  },
  configSchema: OpenHumanConfig,
  defaultConfig: () => ({ enabled: true, serverUrl: "http://127.0.0.1:8899" }),
  create: ({ instanceId, displayName, accentColor, enabled, config }) =>
    Effect.gen(function* () {
      const httpClient = yield* HttpClient.HttpClient;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const serverUrl = config.serverUrl ?? "http://127.0.0.1:8899";
      const continuationIdentity = defaultProviderContinuationIdentity({
        driverKind: DRIVER_KIND,
        instanceId,
      });

      const events = yield* PubSub.unbounded<ProviderRuntimeEvent>();
      const emit = (event: ProviderRuntimeEvent) =>
        PubSub.publish(events, event).pipe(Effect.asVoid);

      // Proactive poller: forwards autonomous alerts from OpenHuman scheduler to T3 clients
      if (enabled) {
        yield* Effect.gen(function* () {
          const req = HttpClientRequest.get(`${serverUrl}/events`).pipe(
            HttpClientRequest.setHeader("accept", "application/json"),
          );
          const raw = yield* Effect.scoped(
            httpClient.execute(req).pipe(
              Effect.flatMap((res) => decodeJson(res)),
              Effect.timeoutOption("3 seconds"),
              Effect.orElseSucceed(() => Option.none()),
            ),
          );
          if (Option.isSome(raw) && Array.isArray(raw.value)) {
            for (const item of raw.value) {
              const now = yield* nowIso;
              const millis = yield* Clock.currentTimeMillis;
              const msg =
                typeof item === "object" && item !== null && "message" in item
                  ? String((item as { message: unknown }).message)
                  : "Proactive system alert";
              yield* emit({
                eventId: EventId.make(`evt-${millis}`),
                provider: DRIVER_KIND,
                createdAt: now,
                type: "warning",
                payload: {
                  message: `[J.A.R.V.I.S.] ${msg}`,
                },
              } as unknown as ProviderRuntimeEvent);
            }
          }
        }).pipe(Effect.repeat({ schedule: Schedule.spaced("5 seconds") }), Effect.forkScoped);
      }

      const probeDaemon = Effect.scoped(
        httpClient.execute(HttpClientRequest.get(`${serverUrl}/health`)).pipe(
          Effect.timeoutOption("2 seconds"),
          Effect.map((res) => Option.isSome(res) && res.value.status < 400),
          Effect.orElseSucceed(() => false),
        ),
      );

      const getSnapshot = Effect.gen(function* () {
        const isOnline = enabled ? yield* probeDaemon : false;
        const now = yield* nowIso;
        return {
          instanceId,
          driver: DRIVER_KIND,
          ...buildServerProvider({
            driver: DRIVER_KIND,
            presentation: {
              displayName: displayName ?? "OpenHuman (J.A.R.V.I.S.)",
              badgeLabel: "Rust Engine",
            },
            enabled,
            checkedAt: now,
            models: [
              {
                slug: "openhuman:jarvis",
                name: "J.A.R.V.I.S. Core",
                isCustom: false,
                capabilities: {},
              },
            ],
            probe: {
              installed: true,
              version: "0.1.0",
              status: isOnline ? "ready" : "warning",
              auth: {
                status: isOnline ? "authenticated" : "unauthenticated",
                type: "local",
              },
              message: isOnline
                ? `Connected to OpenHuman at ${serverUrl}`
                : `OpenHuman daemon offline. Run openhuman with jarvis.config.toml (port 8899).`,
            },
          }),
        } satisfies ServerProvider;
      });

      const snapshot: ServerProviderShape = {
        getSnapshot,
        refresh: getSnapshot,
        resolveMaintenance: () =>
          Effect.succeed({
            provider: DRIVER_KIND,
            packageName: null,
            update: null,
            canCheckForUpdates: false,
            canUpdate: false,
            supportsAutoUpdate: false,
          }),
        streamChanges: Stream.never,
        applyUsageLimits: () => Effect.void,
      };

      const adapter: ProviderAdapterShape<ProviderAdapterError> = {
        provider: DRIVER_KIND,
        capabilities: { sessionModelSwitch: "unsupported" as const },
        streamEvents: Stream.fromPubSub(events),
        startSession: (input: ProviderSessionStartInput) =>
          Effect.succeed({
            sessionId: input.threadId,
            threadId: input.threadId,
            provider: DRIVER_KIND,
            status: "ready" as const,
            modelSelection: input.modelSelection,
          } as unknown as ProviderSession),
        sendTurn: (input: ProviderSendTurnInput) =>
          Effect.gen(function* () {
            const millis = yield* Clock.currentTimeMillis;
            const now = yield* nowIso;
            const turnId = TurnId.make(`turn-${millis}`);
            const payload = {
              jsonrpc: "2.0",
              id: millis,
              method: "turn",
              params: {
                threadId: input.threadId,
                prompt: input.input ?? "",
              },
            };
            const req = HttpClientRequest.post(`${serverUrl}/rpc`).pipe(
              HttpClientRequest.setHeader("content-type", "application/json"),
              HttpClientRequest.bodyJsonUnsafe(payload),
            );

            const outcome = yield* Effect.scoped(
              Effect.gen(function* () {
                const response = yield* httpClient.execute(req).pipe(
                  Effect.timeoutOption("30 seconds"),
                  Effect.mapError(
                    (err) =>
                      new ProviderAdapterRequestError({
                        provider: DRIVER_KIND,
                        method: "sendTurn",
                        detail: `Failed to dispatch turn to OpenHuman: ${err}`,
                      }),
                  ),
                );

                if (Option.isNone(response)) {
                  return yield* new ProviderAdapterRequestError({
                    provider: DRIVER_KIND,
                    method: "sendTurn",
                    detail: `OpenHuman at ${serverUrl} timed out. Ensure the daemon is running.`,
                  });
                }

                const res = response.value;
                const json = yield* decodeJson(res).pipe(Effect.orElseSucceed(() => null));
                return { status: res.status, json };
              }),
            );

            yield* emit({
              eventId: EventId.make(`evt-${millis}`),
              provider: DRIVER_KIND,
              createdAt: now,
              type: "turn.started",
              payload: { threadId: input.threadId, turnId },
            } as unknown as ProviderRuntimeEvent);

            // Phase 4: Self-Evolution Hook (Persist newly learned skills)
            if (outcome.status === 200) {
              const resJson = outcome.json as {
                result?: { newSkill?: { name: string; description?: string; content: string } };
              } | null;
              if (resJson?.result?.newSkill) {
                const s = resJson.result.newSkill;
                yield* recordEvolutionSkill({
                  workspaceCwd: process.cwd(),
                  name: s.name,
                  description: s.description ?? "Self-evolved tool synthesized by J.A.R.V.I.S.",
                  content: s.content,
                }).pipe(
                  Effect.provideService(FileSystem.FileSystem, fs),
                  Effect.provideService(Path.Path, path),
                  Effect.orElseSucceed(() => ""),
                );
              }
            }

            return { threadId: input.threadId, turnId };
          }),
        interruptTurn: () => Effect.void,
        respondToRequest: () => Effect.void,
        respondToUserInput: () => Effect.void,
        stopSession: () => Effect.void,
        listSessions: () => Effect.succeed([]),
        hasSession: () => Effect.succeed(false),
        readThread: (threadId: ThreadId) =>
          Effect.succeed({ threadId, turns: [] } as unknown as ProviderThreadSnapshot),
        rollbackThread: (threadId: ThreadId, _numTurns: number) =>
          Effect.succeed({ threadId, turns: [] } as unknown as ProviderThreadSnapshot),
        stopAll: () => Effect.void,
      };

      const failTextGen = (operation: string) =>
        Effect.fail(
          new TextGenerationError({
            operation,
            detail: "Delegated to OpenHuman native runtime",
          }),
        );
      const textGeneration = {
        generateCommitMessage: () => failTextGen("generateCommitMessage"),
        generatePrContent: () => failTextGen("generatePrContent"),
        generateBranchName: () => failTextGen("generateBranchName"),
        generateThreadTitle: () => failTextGen("generateThreadTitle"),
      };

      return {
        instanceId,
        driverKind: DRIVER_KIND,
        continuationIdentity,
        displayName,
        accentColor,
        enabled,
        snapshot,
        adapter,
        textGeneration,
      } satisfies ProviderInstance;
    }),
};
