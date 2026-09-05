import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { CliUsageError } from '../errors.ts';
import { answerReader } from './shell.ts';
import type { AnswerStream } from './shell.ts';

/**
 * The wizard kit — the stream machinery every interactive verb shares, extracted
 * once because its third copy was the one that raced: `setup` re-typed the ask
 * adapter without awaiting a step, and two prompts were on screen at once. A kit is
 * not an abstraction here; it is the deletion of two copies of a thing that had
 * already drifted (review II, KOT-255).
 *
 * What lives here, and nothing else:
 *
 *  - {@link wizardAsk}: the ask adapter — `answerReader`, the prompt echo, the trim,
 *    and the EOF refusal, whose message is each verb's own (init, hooks and setup
 *    owe the reader different last sentences).
 *  - {@link walkSteps}: the step machine with real back-navigation — the loop
 *    `hooks` always had, `init` mirrored, and `setup` faked with "lands on the last
 *    question". A step is `(ask) => 'ok' | 'back'`; back at the first step is
 *    answered, not ignored.
 *  - {@link confirmLoop} / {@link confirmYesNo}: the confirm prompts, retry copy
 *    included, because two verbs spelling "yes to…" differently is drift.
 *  - {@link listPlannedFiles} / {@link writePlannedFile}: the plan listing and the
 *    one file-write mechanic (mkdir, write, chmod) every apply loop performs.
 *
 * Pure IO plumbing: no verb knowledge, no domain facts, no rendering opinions — the
 * lava adapter stays outside, at the verb boundary, where one switch styles them all.
 */

/** One question at a time, each answered by a line. What every wizard's `ask` is. */
export type Ask = (prompt: string) => Promise<string>;

/** One wizard step: `'ok'` advances, `'back'` returns to the previous step. */
export type Step = (ask: Ask) => Promise<'ok' | 'back'>;

/**
 * The ask adapter over an injected stream. `eofMessage` is the refusal's tail — the
 * one sentence that differs per verb, and the only one allowed to: setup's teaches
 * the non-interactive flags, hooks' says what happens to already-confirmed writes,
 * init's states the plain fact.
 */
export function wizardAsk(
  input: AnswerStream,
  output: (text: string) => void,
  eofMessage: string,
): { ask: Ask; release: () => Promise<void> } {
  const lines = answerReader(input);
  const ask: Ask = async (prompt) => {
    output(prompt);
    const next = await lines.next();
    if (next === undefined) throw new CliUsageError(eofMessage);
    return next.trim();
  };
  return { ask, release: () => lines.release() };
}

/**
 * The step machine: steps in order, `back` moving one step back. The first step's
 * back is answered where the user can read it — there is nothing before it, and
 * pretending otherwise is how a wizard eats an answer. `startAt` is where a confirm's
 * `back` lands: the last step, not the first.
 */
export async function walkSteps(
  steps: readonly Step[],
  ask: Ask,
  say: (text: string) => void,
  startAt = 0,
): Promise<void> {
  let index = startAt;
  while (index < steps.length) {
    const outcome = await steps[index]!(ask);
    if (outcome === 'back') {
      if (index === 0) say(`This is the first step — there is nothing before it.\n`);
      else index -= 1;
    } else {
      index += 1;
    }
  }
}

/**
 * `confirm (yes / no / back)> ` — the three-way confirm. `retryCopy` completes the
 * "yes to …, no to …, back to …" sentence, which is verb knowledge.
 */
export async function confirmLoop(ask: Ask, retryCopy: string): Promise<'yes' | 'no' | 'back'> {
  for (;;) {
    const answer = await ask(`confirm (yes / no / back)> `);
    if (answer === 'back') return 'back';
    if (answer === 'no') return 'no';
    if (answer === 'yes') return 'yes';
    await ask(`${retryCopy}\n`);
  }
}

/** `confirm (yes / no)> ` — the two-way confirm, for flows with no step to return to. */
export async function confirmYesNo(ask: Ask, retryCopy: string): Promise<'yes' | 'no'> {
  for (;;) {
    const answer = await ask(`confirm (yes / no)> `);
    if (answer === 'no') return 'no';
    if (answer === 'yes') return 'yes';
    await ask(`${retryCopy}\n`);
  }
}

/** One planned file, as the listing and the write mechanic both see it. */
export interface PlannedFileLike {
  readonly name: string;
  readonly path: string;
  readonly content: string;
  readonly exists: boolean;
  readonly unchanged: boolean;
  readonly mode?: number;
}

/** One skipped file, with the reason the plan refused it. */
export interface PlannedSkipLike {
  readonly name: string;
  readonly why: string;
}

/** The `  name…padEnd(32) (fate)` listing every confirm prints. */
export function listPlannedFiles(
  say: (text: string) => void,
  files: readonly PlannedFileLike[],
  skipped: readonly PlannedSkipLike[],
  fate: (file: PlannedFileLike) => string,
): void {
  for (const file of files) {
    say(`  ${file.name.padEnd(32)} (${fate(file)})\n`);
  }
  for (const skip of skipped) {
    say(`  ${skip.name.padEnd(32)} (SKIPPED: ${skip.why})\n`);
  }
}

/** The one write mechanic: mkdir, write, chmod — in that order, everywhere. */
export function writePlannedFile(file: PlannedFileLike): void {
  mkdirSync(dirname(file.path), { recursive: true });
  writeFileSync(file.path, file.content);
  if (file.mode !== undefined) chmodSync(file.path, file.mode);
}
