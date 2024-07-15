/* global globalThis */

const { freeze } = Object;

const safeHTMLString = s =>
  // These replacements are for securely inserting into .innerHTML, from
  // https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html#rule-1-html-encode-before-inserting-untrusted-data-into-html-element-content
  `${s}`
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');

export const consoleLines = lines =>
  `${lines}`
    .split('\n')
    .map(
      l =>
        safeHTMLString(l)
          // These two replacements are just for word wrapping, not security.
          .replace(/\t/g, '  ') // expand tabs
          .replace(/ {2}/g, ' &nbsp;'), // try preserving whitespace
    )
    .join('<br />');

export const harden =
  globalThis.harden ??
  (x => {
    freeze(x);
    return x;
  });
