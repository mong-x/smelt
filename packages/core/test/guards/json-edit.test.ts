import { describe, expect, it } from 'vitest';

// Through @guard, so the mutation runner can point this at a deliberately broken
// copy of `src` and watch it go red. See scripts/mutate.mjs.
import { editTopLevelProperty, stripMarkerBlock, upsertMarkerBlock } from '@guard/text/json-edit';

import type { GuardMutation } from './_mutations.ts';

/**
 * JSON-EDIT GUARD — the one promise the byte-faithful editors make: **the edit changes
 * the property it was asked to change, and no other byte.**
 *
 * `smelt hooks install` writes into *other tools'* config files — `.claude/settings.json`,
 * `.codex/hooks.json`, somebody's CLAUDE.md. A `JSON.parse` → `JSON.stringify` round
 * trip would be correct, pass every semantic test, and still rewrite the whole file:
 * key order, indentation, `1e3` → `1000`, `"\u0041"` → `"A"`. The editor exists so the
 * diff a user sees after an install is the hooks property and nothing else, and so
 * `remove` gives back the exact bytes it found.
 *
 * Two assertions carry that, over a corpus of foreign files in styles the installer
 * itself never writes:
 *
 *  1. **Round trip.** Insert our property, then remove it: the original bytes, exactly.
 *  2. **Nothing else moved.** With the property inserted, the original text is the
 *     result with the inserted span cut out, and the inserted span is rendered in the
 *     file's own indentation — an editor that rendered every file in two-space style
 *     would still round-trip, so the round trip alone cannot see it.
 *
 * The mutations below break each half and prove the guard notices.
 */

/**
 * Foreign files, none in the installer's own 2-space LF style. `roundTrip` is what
 * insert-then-remove gives back when that is not the exact original: removing the only
 * property leaves the newline the insert opened the object with — a whitespace-only
 * remainder, which `hooks remove` treats as an empty file and deletes.
 */
const CORPUS: readonly {
  readonly label: string;
  readonly text: string;
  readonly roundTrip?: string;
}[] = [
  {
    label: '4-space, escapes, number spelling',
    text:
      '{\n' +
      '    "permissions": {\n' +
      '        "allow": ["Bash(ls:*)"]\n' +
      '    },\n' +
      '    "env": {\n' +
      '        "FOO": "a\\u0041b"\n' +
      '    },\n' +
      '    "num": 1e3\n' +
      '}\n',
  },
  { label: 'tabs, CRLF', text: '{\r\n\t"a": [1, {"b": "}"}],\r\n\t"c": null\r\n}\r\n' },
  { label: 'one line, no spaces', text: '{"a":1,"b":[true,false]}' },
  { label: 'empty object', text: '{}\n', roundTrip: '{\n}\n' },
  { label: 'leading and trailing whitespace', text: '\n  { "x": "y" }\n\n' },
];

const VALUE = { PreToolUse: [{ matcher: 'Read', hooks: [{ type: 'command', command: 'x' }] }] };

describe('the byte-faithful editor changes one property and nothing else', () => {
  for (const { label, text, roundTrip = text } of CORPUS) {
    it(`round trip — insert then remove restores the bytes: ${label}`, () => {
      const inserted = editTopLevelProperty(text, 'hooks', VALUE);
      expect(inserted, 'the corpus entry must be an editable object').toBeDefined();
      expect(JSON.parse(inserted!)).toMatchObject({ hooks: VALUE });
      expect(
        editTopLevelProperty(inserted!, 'hooks', undefined),
        `remove after insert must give back the exact original — a byte that moved is ` +
          `an edit the user never asked for`,
      ).toBe(roundTrip);
    });

    it(`nothing else moved — the original is the result minus the inserted span: ${label}`, () => {
      const inserted = editTopLevelProperty(text, 'hooks', VALUE)!;
      const from = inserted.indexOf('"hooks"');
      expect(from).toBeGreaterThan(-1);
      // Everything before the inserted key is original text (up to the comma the
      // insert added, when the object was not empty).
      const head = inserted.slice(0, from).replace(/,?\s*$/, '');
      expect(text.startsWith(head), 'every byte before the property is original').toBe(true);
      // Everything after the inserted value is the original's tail.
      const tail = text.slice(head.length).replace(/^\s*/, '');
      expect(inserted.endsWith(tail), 'every byte after the property is original').toBe(true);
    });
  }

  it("renders the inserted value in the file's own indentation, not the installer's", () => {
    const fourSpace = '{\n    "a": 1\n}\n';
    expect(editTopLevelProperty(fourSpace, 'hooks', { x: { y: 1 } })).toBe(
      '{\n    "a": 1,\n    "hooks": {\n        "x": {\n            "y": 1\n        }\n    }\n}\n',
    );
    const tabs = '{\r\n\t"a": 1\r\n}\r\n';
    expect(editTopLevelProperty(tabs, 'hooks', [1])).toBe(
      '{\r\n\t"a": 1,\r\n\t"hooks": [\r\n\t\t1\r\n\t]\r\n}\r\n',
    );
  });

  it('a replaced value leaves the neighbours byte-identical', () => {
    const text = '{"before": 1e3, "hooks": {"old": true}, "after": "a\\u0041"}';
    expect(editTopLevelProperty(text, 'hooks', 0)).toBe(
      '{"before": 1e3, "hooks": 0, "after": "a\\u0041"}',
    );
  });

  it('removing a property that is not last leaves the neighbour after it intact', () => {
    // `remove` strips `hooks` out of a file where the user added keys after it; the
    // insert-then-remove round trip above only ever removes a *last* property.
    expect(
      editTopLevelProperty('{\n  "hooks": {"x": 1},\n  "permissions": {}\n}\n', 'hooks', undefined),
    ).toBe('{\n  "permissions": {}\n}\n');
    expect(editTopLevelProperty('{"a": 1, "hooks": [1], "z": 3}', 'hooks', undefined)).toBe(
      '{"a": 1, "z": 3}',
    );
  });
});

describe('the marker block round-trips the same way', () => {
  const START = '<!-- smelt:start -->';
  const END = '<!-- smelt:end -->';
  const block = `${START}\nours\n${END}\n`;

  for (const original of ['# Mine\n', '# Mine\n\nRules.\n\n\n', 'no trailing newline']) {
    it(`upsert then strip restores ${JSON.stringify(original)} (one trailing newline)`, () => {
      const withBlock = upsertMarkerBlock(original, block, START, END);
      expect(withBlock).toContain(original.trimEnd());
      expect(stripMarkerBlock(withBlock, START, END)).toBe(original.replace(/\n*$/, '\n'));
    });
  }
});

/**
 * The breaks this guard must catch. `pnpm mutate` applies each one to a scratch copy
 * of `src` and asserts this file goes red — see `test/guards/_mutations.ts`.
 */
export const MUTATIONS: GuardMutation[] = [
  {
    id: 'json-edit-remove-eats-neighbour',
    file: 'text/json-edit.ts',
    find: 'return text.slice(0, property.keyStart) + text.slice(next.keyStart);',
    replace: 'return text.slice(0, property.keyStart) + text.slice(next.valueEnd);',
    why: 'removing our property deletes the foreign property after it too — `smelt hooks remove` would silently take the neighbouring `permissions` key out with the hooks, the exact "edited what it was never asked to" the byte-faithful editor exists to refuse',
  },
  {
    id: 'json-edit-render-ignores-file-indent',
    file: 'text/json-edit.ts',
    find: 'return JSON.stringify(value, null, stringifyIndent).split',
    replace: 'return JSON.stringify(value, null, 2).split',
    why: 'the inserted value rendered in two-space style regardless of what the file uses — a 4-space or tab-indented settings.json would still parse and still round-trip, but every install would leave a mis-indented block the user has to hand-fix',
  },
];
