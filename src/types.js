export {};

/**
 * @template [R=never]
 * @typedef {(tsa: TemplateStringsArray, ...args: any[]) => R} FailWithDefault
 */

/**
 * @template [R=never]
 * @typedef {(maker: (s: string, ...args: any[]) => any, ...args: any[]) => FailWithDefault<R>} FailWithMaker
 */

/**
 * @template [R=never]
 * @typedef {(tsaOrMaker: TemplateStringsArray |
 *   ((s: string, ...args: any[]) => any), ...args: any[]) =>
 *     R | FailWithDefault<R>} FailWithGeneral
 */

/**
 * @template [R=never]
 * @callback CommitFailure
 * @param {[TemplateStringsArray, ...any[]]} tagCall
 * @param {(s: string, ...args: any[]) => any} maker
 * @param {...any[]} restArgs
 * @returns {R}
 */
