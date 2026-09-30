import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

export class EvolutionSkillError extends Schema.TaggedError<EvolutionSkillError>()(
  "EvolutionSkillError",
  {
    message: Schema.String,
  },
) {}

export interface EvolutionSkillInput {
  readonly workspaceCwd: string;
  readonly name: string;
  readonly description: string;
  readonly content: string;
}

/**
 * OpenHumanEvolution (Phase 4: Self-Evolution Loop)
 *
 * Saves newly synthesized workflows and scripts directly into `.agents/skills/<name>/SKILL.md`
 * so any agent running in the workspace permanently retains the learning.
 */
export function recordEvolutionSkill(
  input: EvolutionSkillInput,
): Effect.Effect<string, EvolutionSkillError, FileSystem.FileSystem | Path.Path> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const slug = input.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    if (!slug) {
      return yield* new EvolutionSkillError({ message: "Invalid skill name" });
    }

    const skillDir = path.join(input.workspaceCwd, ".agents", "skills", slug);
    const skillFile = path.join(skillDir, "SKILL.md");

    const exists = yield* fs
      .exists(skillDir)
      .pipe(Effect.mapError((err) => new EvolutionSkillError({ message: String(err) })));
    if (!exists) {
      yield* fs
        .makeDirectory(skillDir, { recursive: true })
        .pipe(Effect.mapError((err) => new EvolutionSkillError({ message: String(err) })));
    }

    const fileContent = `---
name: ${slug}
description: ${input.description}
---

# ${input.name}

${input.content.trim()}
`;

    yield* fs
      .writeFileString(skillFile, fileContent)
      .pipe(Effect.mapError((err) => new EvolutionSkillError({ message: String(err) })));
    return skillFile;
  });
}
