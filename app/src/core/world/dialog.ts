/**
 * A dialog's text as the child reads it (docs/kids/SDD_WORLD.md, text
 * rules): every "\n" opens a page, and a page holds at most 120
 * characters. A longer line is split between words, so nothing is cut.
 * `${{name}}` (the old game's player-name variable) and `{name}` become
 * the child's name.
 */

export const PAGE_MAX = 120;

/** Puts the child's name into a catalogue text. */
export function fillText(text: string, values: { name: string }): string {
  return text.replace(/\$\{\{name\}\}|\{name\}/g, values.name);
}

/** The pages of a text: one per line, none over {@link PAGE_MAX} characters. */
export function pages(text: string, max = PAGE_MAX): string[] {
  const out: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if ([...line].length <= max) {
      out.push(line);
      continue;
    }
    let page = "";
    for (const word of line.split(/\s+/)) {
      const next = page ? `${page} ${word}` : word;
      if ([...next].length <= max) {
        page = next;
        continue;
      }
      if (page) out.push(page);
      // a "word" longer than a page (never in the catalogue): cut it
      let rest = [...word];
      while (rest.length > max) {
        out.push(rest.slice(0, max).join(""));
        rest = rest.slice(max);
      }
      page = rest.join("");
    }
    if (page) out.push(page);
  }
  return out;
}
