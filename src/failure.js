// @ts-check
/* global globalThis */

/**
 * @import { FailWithDefault, FailWithGeneral, ReturnFailure as ReturnFailure } from './types.js';
 */

/**
 * @type {<T>(x: T) => T}
 */
const harden = globalThis.harden || Object.freeze;

/**
 * @template [R=never]
 * @param {ReturnFailure<R>} commitFailure
 * @returns {FailWithGeneral<R>}
 */
export const makeFailWith = commitFailure => {
  /**
   * @type {FailWithGeneral<R>}
   */
  const failWith = (tsaOrMaker, ...restArgs) => {
    if (typeof tsaOrMaker === 'function') {
      // Explicit maker, and arguments are intended for it.
      /** @type {FailWithDefault<R>} */
      return (tsa, ...deets) =>
        commitFailure(tsaOrMaker, [tsa, ...deets], ...restArgs);
    }
    return commitFailure(Error, [tsaOrMaker, ...restArgs]);
  };

  return harden(failWith);
};
harden(makeFailWith);

/**
 * @param {any} _zone
 * @param {object} powers
 * @param {typeof Promise.reject} powers.reject
 * @param {import('ses').Assert} powers.assert
 * @returns
 */
export const prepareFailureTools = (_zone, powers) => {
  const {
    assert: { error: assertError, details: assertDetails },
  } = powers || {};

  /**
   * @type {ReturnFailure<Error>}
   */
  const createError =
    (assertError &&
      assertDetails &&
      ((Error, [tsa, ...deets], ...rest) =>
        assertError(assertDetails(tsa, ...deets), Error, ...rest))) ||
    ((Error, [tsa, ...deets], ...rest) =>
      Error(String.raw({ raw: tsa }, ...deets), ...rest));

  /** @type {ReturnFailure<never>} */
  const commitThrow = (maker, tagCall, ...restArgs) => {
    const err = createError(maker, tagCall, ...restArgs);
    throw err;
  };
  const throwWith = makeFailWith(commitThrow);

  return harden({ createError, makeFailWith, throwWith });
};
