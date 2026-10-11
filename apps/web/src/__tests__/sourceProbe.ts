/**
 * Reading the shell's own source, for the guards that have no other way to reach a wiring.
 *
 * apps/web has no component harness, so a call that only happens inside `usePuffly`'s event handler
 * cannot be driven. What these two helpers buy is exactly what a structural check can buy — the call
 * exists, it is in the branch that means it, and it happens once — and nothing more: a wrong
 * argument, a thrown exception, or a value that never reaches the engine still pass here. Every file
 * that uses this says so in its own header rather than implying a stronger claim.
 */

import { readFileSync } from 'node:fs';

/** The shell's composable, which is where every one-off wiring lives. */
export function shellSource(): string {
  return readFileSync(new URL('../composables/usePuffly.ts', import.meta.url), 'utf8');
}

/** The body of the first `if` whose condition matches, taken by brace matching rather than by line. */
export function blockAfter(source: string, condition: RegExp): string {
  const found = condition.exec(source);
  if (!found) throw new Error(`no branch matching ${condition}`);
  const open = source.indexOf('{', found.index + found[0].length - 1);
  if (open < 0) throw new Error('branch has no body');
  let depth = 0;
  for (let index = open; index < source.length; index++) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}' && --depth === 0) return source.slice(open, index + 1);
  }
  throw new Error('unbalanced braces');
}

/**
 * Source with its comments gone. A guard that reads a file which explains the rule it guards will
 * otherwise be satisfied by that prose: a deleted attribute still matched the sentence naming it.
 */
export function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
}
