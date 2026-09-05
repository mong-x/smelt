/**
 * Byte-faithful edits to somebody else's text file.
 *
 * Two editors, one contract: **change the one thing you were asked to change and
 * leave every other byte alone.** An installer that reformats a settings file has
 * edited what it was never asked to — key order, indentation, string escapes, number
 * spellings and unknown keys are all somebody's choices, and `JSON.parse` →
 * `JSON.stringify` erases every one of them.
 *
 *  - {@link editTopLevelProperty}: replace, insert or remove **one top-level property**
 *    of a JSON object, in its source text. The value is rendered fresh; nothing
 *    outside its bytes moves. Callers have already `JSON.parse`d the text and decided
 *    what the new value is; this module holds only the tokenising.
 *  - {@link upsertMarkerBlock} / {@link stripMarkerBlock}: the same idea over a
 *    delimited block in a plain-text file (an instruction file, a Markdown snippet
 *    between two marker lines).
 *
 * Neither knows what a harness or a hook is. `cli/hooks.ts` is the consumer today; the
 * module lives under `src/text/` rather than `cli/` because its whole interface is
 * strings in, strings out — it reads no argv, prints nothing and imports nothing from
 * the CLI, and the next byte-faithful editor (an instruction-file rewrite) wants a
 * sibling here, not a CLI import.
 */

/** How a JSON file is laid out — what a rendered value must match to blend in. */
export interface JsonStyle {
  /** The indentation unit — the whitespace before a top-level key. */
  readonly indent: string;
  /** `'\r\n'` when the file uses it anywhere, `'\n'` otherwise. */
  readonly newline: string;
}

/**
 * The layout an existing file uses: its first indented key's leading whitespace (two
 * spaces when nothing is indented) and its newline convention. Detected once, before
 * any edit, so a sequence of edits renders consistently even after an earlier one has
 * changed the first indented line.
 */
export function jsonStyle(text: string): JsonStyle {
  return {
    newline: text.includes('\r\n') ? '\r\n' : '\n',
    indent: /\n([ \t]+)"/.exec(text)?.[1] ?? '  ',
  };
}

/**
 * Replace, insert or remove one top-level property of the JSON object in `text`,
 * leaving every other byte verbatim.
 *
 *  - `value` defined: the property's value is replaced in place when the key exists,
 *    otherwise the property is appended after the last one (or into an empty object).
 *  - `value === undefined`: the property is removed, with its separating comma and
 *    whitespace; a key that is not there is a no-op and the text comes back unchanged.
 *
 * The rendered value is `JSON.stringify(value, null, indent)`, re-indented to sit at
 * top level. `style` defaults to {@link jsonStyle} of `text`; pass it explicitly when
 * making several edits to one file.
 *
 * Returns `undefined` when `text` is not a JSON object the scanner can walk — an
 * array, a scalar, or something that is not JSON at all. Callers should have
 * `JSON.parse`d first and refused; this is belt and braces, not a validator.
 */
export function editTopLevelProperty(
  text: string,
  key: string,
  value: unknown,
  style: JsonStyle = jsonStyle(text),
  valueIndent: string = style.indent,
): string | undefined {
  const scan = scanJsonTopLevel(text);
  if (scan === undefined) return undefined;
  const property = scan.properties.find((candidate) => candidate.key === key);
  if (value === undefined) {
    return property === undefined ? text : removeJsonProperty(text, scan, property);
  }
  const rendered = renderJsonValue(value, valueIndent, style.indent, style.newline);
  return property !== undefined
    ? `${text.slice(0, property.valueStart)}${rendered}${text.slice(property.valueEnd)}`
    : insertJsonProperty(text, scan, key, rendered, style.indent, style.newline);
}

/** One top-level property of a JSON object, located by offsets in its source text. */
interface JsonTopLevelProperty {
  readonly key: string;
  /** Offset of the key's opening quote. */
  readonly keyStart: number;
  /** Offset of the value's first byte. */
  readonly valueStart: number;
  /** Offset one past the value's last byte. */
  readonly valueEnd: number;
}

interface JsonTopLevelScan {
  /** Offset of the root object's `{`. */
  readonly open: number;
  /** Offset of the root object's `}`. */
  readonly close: number;
  readonly properties: readonly JsonTopLevelProperty[];
}

/**
 * Locate the top-level properties of a JSON object *in its source text*, so one
 * property can be replaced, inserted or removed while every other byte of the file
 * rides through verbatim. `undefined` when the text is not an object.
 */
function scanJsonTopLevel(text: string): JsonTopLevelScan | undefined {
  let i = skipJsonWhitespace(text, 0);
  if (text[i] !== '{') return undefined;
  const open = i;
  i = skipJsonWhitespace(text, i + 1);
  const properties: JsonTopLevelProperty[] = [];
  if (text[i] === '}') return { open, close: i, properties };
  for (;;) {
    if (text[i] !== '"') return undefined;
    const keyStart = i;
    const keyEnd = skipJsonString(text, i);
    if (keyEnd === undefined) return undefined;
    const key = JSON.parse(text.slice(keyStart, keyEnd)) as string;
    i = skipJsonWhitespace(text, keyEnd);
    if (text[i] !== ':') return undefined;
    const valueStart = skipJsonWhitespace(text, i + 1);
    const valueEnd = skipJsonValue(text, valueStart);
    if (valueEnd === undefined) return undefined;
    properties.push({ key, keyStart, valueStart, valueEnd });
    i = skipJsonWhitespace(text, valueEnd);
    if (text[i] === ',') {
      i = skipJsonWhitespace(text, i + 1);
      continue;
    }
    if (text[i] === '}') return { open, close: i, properties };
    return undefined;
  }
}

function skipJsonWhitespace(text: string, from: number): number {
  let i = from;
  while (i < text.length && ' \t\r\n'.includes(text[i]!)) i += 1;
  return i;
}

/** `from` points at `"`; returns the offset one past the closing quote. */
function skipJsonString(text: string, from: number): number | undefined {
  let i = from + 1;
  while (i < text.length) {
    if (text[i] === '\\') i += 2;
    else if (text[i] === '"') return i + 1;
    else i += 1;
  }
  return undefined;
}

function skipJsonValue(text: string, from: number): number | undefined {
  const first = text[from];
  if (first === '"') return skipJsonString(text, from);
  if (first === '{' || first === '[') {
    let depth = 0;
    let i = from;
    while (i < text.length) {
      const ch = text[i]!;
      if (ch === '"') {
        const end = skipJsonString(text, i);
        if (end === undefined) return undefined;
        i = end;
        continue;
      }
      if (ch === '{' || ch === '[') depth += 1;
      else if (ch === '}' || ch === ']') {
        depth -= 1;
        if (depth === 0) return i + 1;
      }
      i += 1;
    }
    return undefined;
  }
  // number / true / false / null
  let i = from;
  while (i < text.length && !',}] \t\r\n'.includes(text[i]!)) i += 1;
  return i > from ? i : undefined;
}

/**
 * A JSON value rendered for embedding at a property position. `stringifyIndent` is
 * the unit its own members nest by; `joinIndent` is where the value sits — for a
 * top-level property they are the same, and for a member of a nested container the
 * value sits at the member's indent while its members keep nesting by the file's
 * unit, which is the difference between `command` landing one level under `smelt`
 * or two under it.
 */
function renderJsonValue(
  value: unknown,
  stringifyIndent: string,
  joinIndent: string,
  newline: string,
): string {
  return JSON.stringify(value, null, stringifyIndent).split('\n').join(`${newline}${joinIndent}`);
}

function removeJsonProperty(
  text: string,
  scan: JsonTopLevelScan,
  property: JsonTopLevelProperty,
): string {
  const index = scan.properties.indexOf(property);
  const next = scan.properties[index + 1];
  if (next !== undefined) {
    // Delete through the separating comma and whitespace, up to the next key.
    return text.slice(0, property.keyStart) + text.slice(next.keyStart);
  }
  const previous = scan.properties[index - 1];
  // Last (or only) property: delete the preceding comma (if any) with it.
  const from = previous !== undefined ? previous.valueEnd : scan.open + 1;
  return text.slice(0, from) + text.slice(property.valueEnd);
}

function insertJsonProperty(
  text: string,
  scan: JsonTopLevelScan,
  key: string,
  renderedValue: string,
  indent: string,
  newline: string,
): string {
  const entry = `${JSON.stringify(key)}: ${renderedValue}`;
  if (scan.properties.length === 0) {
    return `${text.slice(0, scan.open + 1)}${newline}${indent}${entry}${newline}${text.slice(scan.close)}`;
  }
  const last = scan.properties[scan.properties.length - 1]!;
  return `${text.slice(0, last.valueEnd)},${newline}${indent}${entry}${text.slice(last.valueEnd)}`;
}

/**
 * `editJsonProperty`: the same contract, one level deeper. Replace, insert or remove
 * the property at `path` — e.g. `['mcpServers', 'smelt']` — where the *container* is a
 * top-level property whose value is itself a JSON object. Everything outside the
 * edited bytes rides through verbatim, including sibling entries inside the container.
 *
 * When the container key is absent and a value is given, the container is created
 * fresh around the entry. When a removal empties the container, the container is
 * lifted out too — a file that never carried the key comes back byte-identical after
 * an apply → remove round trip, and one that carried other entries keeps them
 * untouched. Returns `undefined` when the container's value is not a JSON object the
 * scanner can walk (the caller refuses or skips, as with {@link editTopLevelProperty}).
 */
export function editJsonProperty(
  text: string,
  path: readonly [string, ...(readonly string[])],
  value: unknown,
  style: JsonStyle = jsonStyle(text),
): string | undefined {
  return editJsonPropertyAt(text, path, value, style, style.indent);
}

/** The walker: same body, `path` as a plain (runtime-checked) array. */
function editJsonPropertyAt(
  text: string,
  path: readonly string[],
  value: unknown,
  style: JsonStyle,
  baseIndent: string,
): string | undefined {
  const head = path[0]!;
  const rest = path.slice(1);
  if (rest.length === 0) return editTopLevelProperty(text, head, value, style, baseIndent);
  const scan = scanJsonTopLevel(text);
  if (scan === undefined) return undefined;
  const property = scan.properties.find((candidate) => candidate.key === head);
  if (property === undefined) {
    if (value === undefined) return text; // nothing to remove under an absent container
    // Build the fresh container from the tail of the path, then hand it to the
    // top-level editor as a plain value — one renderer, one indent story.
    const container: Record<string, unknown> = {};
    let cursor = container;
    for (const key of rest.slice(0, -1)) {
      const next: Record<string, unknown> = {};
      cursor[key] = next;
      cursor = next;
    }
    cursor[rest[rest.length - 1]!] = value;
    return editTopLevelProperty(text, head, container, style);
  }
  const inner = text.slice(property.valueStart, property.valueEnd);
  // The container's members sit one unit deeper than the file's top level — read
  // that unit off the container's own first key, so a fresh member lands beside its
  // siblings and the member's *value* keeps nesting by the file's unit (passed as
  // valueIndent), which is what one level deeper actually means.
  const memberIndent = /\n([ \t]+)"/.exec(inner)?.[1] ?? style.indent + style.indent;
  const edited = editJsonPropertyAt(
    inner,
    rest,
    value,
    { ...style, indent: memberIndent },
    baseIndent,
  );
  if (edited === undefined) return undefined; // the container's value is not an object
  if (edited === inner) return text;
  if (value === undefined && removesToEmptyObject(edited)) {
    // The container is now `{}` and it only got that way because of this removal —
    // lift it out, so a file that never carried the key round-trips byte-identical.
    return editTopLevelProperty(text, head, undefined, style) ?? text;
  }
  return `${text.slice(0, property.valueStart)}${edited}${text.slice(property.valueEnd)}`;
}

/** True when `text` is exactly a JSON object with no properties. */
function removesToEmptyObject(text: string): boolean {
  const scan = scanJsonTopLevel(text);
  return scan !== undefined && scan.properties.length === 0;
}

/* ------------------------------------------------------------------------------------
 * Marker blocks
 * ---------------------------------------------------------------------------------- */

/**
 * Replace the block delimited by `start` … `end` in `existingText`, or append it.
 *
 * An absent or blank file becomes exactly `block`. A file that carries the block has
 * it replaced in place (one newline after `end` is absorbed, so a block that ends in
 * its own newline does not grow a blank line per re-run). A file without it gets the
 * block appended after exactly one blank line, whatever trailing newlines it had.
 */
export function upsertMarkerBlock(
  existingText: string | undefined,
  block: string,
  start: string,
  end: string,
): string {
  if (existingText === undefined || existingText.trim() === '') return block;
  const startIndex = existingText.indexOf(start);
  const endIndex = existingText.indexOf(end);
  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    const before = existingText.slice(0, startIndex);
    const after = existingText.slice(endIndex + end.length).replace(/^\n/, '');
    return `${before}${block}${after}`;
  }
  return `${existingText.replace(/\n*$/, '\n\n')}${block}`;
}

/**
 * Remove the block delimited by `start` … `end`. The text comes back unchanged when
 * the block is not there; `undefined` when nothing (or only whitespace) remains — the
 * file was entirely the block, and the caller decides whether to delete it.
 */
export function stripMarkerBlock(
  existingText: string,
  start: string,
  end: string,
): string | undefined {
  const startIndex = existingText.indexOf(start);
  const endIndex = existingText.indexOf(end);
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) return existingText;
  const stripped =
    existingText.slice(0, startIndex).replace(/\n+$/, '\n') +
    existingText.slice(endIndex + end.length).replace(/^\n+/, '');
  return stripped.trim() === '' ? undefined : stripped;
}
