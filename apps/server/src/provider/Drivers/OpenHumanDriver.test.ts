import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import { ProviderInstanceId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import { HttpClient } from "effect/unstable/http";

import { recordEvolutionSkill } from "../Layers/OpenHumanEvolution.ts";
import { OpenHumanDriver } from "./OpenHumanDriver.ts";

const testLayer = NodeServices.layer.pipe(
  Layer.provideMerge(
    Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make(() => Effect.succeed({ status: 200, json: Effect.succeed([]) } as any)),
    ),
  ),
);

it.layer(testLayer)("OpenHumanDriver", (it) => {
  it.effect("instantiates and advertises J.A.R.V.I.S. Core model", () =>
    Effect.gen(function* () {
      const instance = yield* OpenHumanDriver.create({
        instanceId: ProviderInstanceId.make("openhuman-test"),
        displayName: "J.A.R.V.I.S.",
        enabled: true,
        environment: [],
        config: { enabled: true, serverUrl: "http://127.0.0.1:8899" },
      });

      expect(instance.driverKind).toBe("openhuman");
      const snapshot = yield* instance.snapshot.getSnapshot;
      expect(snapshot.models.some((m) => m.slug === "openhuman:jarvis")).toBe(true);
    }),
  );

  it.effect("records self-evolved skills to .agents/skills", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const tempDir = yield* fs.makeTempDirectoryScoped({ prefix: "t3-jarvis-skill-" });

      const skillPath = yield* recordEvolutionSkill({
        workspaceCwd: tempDir,
        name: "test-optimizer",
        description: "A test self-evolved optimizer",
        content: "Run test optimizer steps.",
      });

      const exists = yield* fs.exists(skillPath);
      expect(exists).toBe(true);
      const content = yield* fs.readFileString(skillPath);
      expect(content).toContain("name: test-optimizer");
      expect(content).toContain("A test self-evolved optimizer");
    }),
  );
});
