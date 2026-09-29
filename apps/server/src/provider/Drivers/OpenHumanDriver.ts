import {
  type ModelSelection,
  ProviderDriverKind,
  type ServerProvider,
  TextGenerationError,
  TurnId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";

import { ProviderAdapterError } from "../Errors.ts";
import { buildServerProvider } from "../providerSnapshot.ts";
import {
  defaultProviderContinuationIdentity,
  type ProviderDriver,
  type ProviderInstance,
} from "../ProviderDriver.ts";

export const OpenHumanConfig = Schema.Struct({
  enabled: Schema.optionalWith(Schema.Boolean, { default: () => true }),
  serverUrl: Schema.optionalWith(Schema.String, { default: () => "http://127.0.0.1:8899" }),
});
export type OpenHumanConfig = typeof OpenHumanConfig.Type;

export const DRIVER_KIND = ProviderDriverKind.make("openhuman");

export type OpenHumanDriverEnv = HttpClient.HttpClient;

export const OpenHumanDriver: ProviderDriver<OpenHumanConfig, OpenHumanDriverEnv> = {
  driverKind: DRIVER_KIND,
  metadata: {
    displayName: "OpenHuman (J.A.R.V.I.S.)",
    supportsMultipleInstances: false,
  },
  configSchema: OpenHumanConfig,
  create: ({ instanceId, displayName, accentColor, enabled, config }) =>
    Effect.gen(function* () {
      const httpClient = yield* HttpClient.HttpClient;
      const continuationIdentity = defaultProviderContinuationIdentity({
        driverKind: DRIVER_KIND,
        instanceId,
      });

      const probeDaemon = httpClient
        .execute(HttpClientRequest.get(`${config.serverUrl}/health`))
        .pipe(
          Effect.timeoutOption("2 seconds"),
          Effect.map((res) => Option.isSome(res) && res.value.status < 400),
          Effect.orElseSucceed(() => false),
        );

      const getSnapshot = Effect.gen(function* () {
        const isOnline = enabled ? yield* probeDaemon : false;
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
            checkedAt: new Date().toISOString(),
            models: [
              {
                slug: "openhuman:jarvis",
                name: "J.A.R.V.I.S. Core",
                capabilities: {
                  supportsReasoningEffort: false,
                  supportsImageInput: true,
                  reportsContextWindow: true,
                },
              },
            ],
            probe: {
              installed: true,
              version: "0.1.0",
              status: enabled ? (isOnline ? "ready" : "unauthenticated") : "disabled",
              auth: { type: "local" },
              message: isOnline
                ? `Connected to OpenHuman at ${config.serverUrl}`
                : `OpenHuman daemon offline. Run openhuman with jarvis.config.toml (port 8899).`,
            },
          }),
        } satisfies ServerProvider;
      });

      const snapshot = {
        getSnapshot,
        changes: Effect.never,
      };

      const adapter = {
        provider: DRIVER_KIND,
        capabilities: { sessionModelSwitch: "unsupported" as const },
        startSession: (input: { sessionId: string; modelSelection?: ModelSelection }) =>
          Effect.succeed({
            sessionId: input.sessionId,
            driver: DRIVER_KIND,
            status: "ready" as const,
            modelSelection: input.modelSelection,
          }),
        sendTurn: (input: { threadId: string; prompt: string }) =>
          Effect.gen(function* () {
            const turnId = TurnId.make(`turn-${Date.now()}`);
            const body = JSON.stringify({
              jsonrpc: "2.0",
              id: Date.now(),
              method: "turn",
              params: {
                threadId: input.threadId,
                prompt: input.prompt,
              },
            });
            const req = HttpClientRequest.post(`${config.serverUrl}/rpc`).pipe(
              HttpClientRequest.setHeader("content-type", "application/json"),
              HttpClientRequest.bodyText(body),
            );
            const response = yield* httpClient.execute(req).pipe(
              Effect.timeoutOption("30 seconds"),
              Effect.mapError(
                (err) =>
                  new ProviderAdapterError({
                    provider: DRIVER_KIND,
                    operation: "sendTurn",
                    detail: `Failed to dispatch turn to OpenHuman: ${err}`,
                  }),
              ),
            );

            if (Option.isNone(response)) {
              return yield* Effect.fail(
                new ProviderAdapterError({
                  provider: DRIVER_KIND,
                  operation: "sendTurn",
                  detail: `OpenHuman at ${config.serverUrl} timed out. Ensure the daemon is running.`,
                }),
              );
            }

            return { turnId };
          }),
        interruptTurn: () => Effect.void,
        respondToRequest: () => Effect.void,
        respondToUserInput: () => Effect.void,
        stopSession: () => Effect.void,
        listSessions: () => Effect.succeed([]),
        hasSession: () => Effect.succeed(false),
        readThread: (threadId: string) => Effect.succeed({ threadId, turns: [] }),
        rollbackThread: (threadId: string) => Effect.succeed({ threadId, turns: [] }),
        stopAllSessions: () => Effect.void,
      };

      const failTextGen = () =>
        Effect.fail(new TextGenerationError({ message: "Delegated to OpenHuman native runtime" }));
      const textGeneration = {
        generateCommitMessage: failTextGen,
        generatePrContent: failTextGen,
        generateBranchName: failTextGen,
        generateThreadTitle: failTextGen,
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
