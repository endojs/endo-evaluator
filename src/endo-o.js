/* global globalThis */
/* eslint-disable max-classes-per-file, no-param-reassign, no-void */

import { prepareEventualTools } from './eventual.js';
import { prepareFailureTools } from './failure.js';

/**
 * @template T,U
 * @typedef {T extends { (...args: infer P): infer R; } ?
 *   { (...args: P): OCell<Awaited<R>>; } :
 *   U
 * } AsyncCallable ensure that all callables are async
 */

/**
 * @template T
 * @typedef { { [K in keyof T]: AsyncCallable<T[K], OCell<Awaited<T[K]>>> } } AsyncShallow
 */

/**
 * @template T
 * @typedef {BigInt extends T ? AsyncShallow<BigIntConstructor['prototype']> :
 *   String extends T ? AsyncShallow<StringConstructor['prototype']> :
 *   Boolean extends T ? AsyncShallow<BooleanConstructor['prototype']> :
 *   Number extends T ? AsyncShallow<NumberConstructor['prototype']> :
 *   Symbol extends T ? AsyncShallow<SymbolConstructor['prototype']> :
 *   {}
 * } AsyncPrimitive Primitives need to be explicitly handled or else their
 * prototype methods aren't asyncified.
 */

/**
 * @template [T=any]
 * @typedef {Promise<Awaited<T>> & AsyncCallable<T, {}> & AsyncShallow<T> &
 * AsyncPrimitive<T>} OCell A cell is a wrapper for an object on which
 * operations (await, call, index) return a promise for execution in a future
 * turn
 */

/**
 * @type {<T>(x: T) => T}
 */
const harden = globalThis.harden || Object.freeze;

const sink = harden(() => {});

const DEFAULT_PROMISE_METHODS = ['then'];
harden(DEFAULT_PROMISE_METHODS);

/**
 * @typedef {(...args: any[]) => any} T
 * @param {T} target
 * @returns {T}
 */
export const stripFunction = target => {
  Object.setPrototypeOf(target, { [Symbol.toStringTag]: 'OCell' });
  for (const key of Reflect.ownKeys(target)) {
    delete target[key];
  }
  return target;
};

const makeTarget = (getThisArg, shadowMethodEntries) => {
  const target = stripFunction(() => {});
  for (const [key, fn] of shadowMethodEntries) {
    Object.defineProperty(target, key, {
      enumerable: true,
      value: (...args) => Reflect.apply(fn, getThisArg(), args),
    });
  }
  // harden(target);
  return target;
};

/**
 * @param {unknown} zone TODO: use zones.
 * @param {object} [powers]
 * @param {{
 *   applyFunction: (x: unknown, args: any[]) => Promise<unknown>
 *   applyMethod: (x: unknown, prop: PropertyKey, args: any[]) => Promise<unknown>
 *   get: (x: unknown, prop: PropertyKey) => Promise<unknown>
 * }} [powers.HandledPromise]
 * @param {(specimen: unknown) => Promise<any>} [powers.when]
 * @param {object} [opts]
 * @param {string[]} [opts.promiseMethods]
 */
export const prepareOTools = (
  zone,
  powers,
  { promiseMethods = DEFAULT_PROMISE_METHODS } = {},
) => {
  const {
    when = x => {
      const p = Promise.resolve(x);
      p.catch(sink);
      return p;
    },
    assert = globalThis.assert,
    HandledPromise = globalThis.HandledPromise,
  } = powers || {};

  const promiseMethodEntries = promiseMethods.map(key => [
    key,
    Promise.prototype[key],
  ]);
  const promiseMethodNames = new Set(promiseMethods);

  const { throwWith, makeFailWith, createError } = prepareFailureTools(
    zone.subZone('failure'),
    {
      assert,
      reject: HandledPromise
        ? HandledPromise.reject.bind(HandledPromise)
        : undefined,
    },
  );
  const {
    Promise: { eventual },
    EventualFactory,
  } = prepareEventualTools(zone.subZone('eventual'), {
    HandledPromise,
    throwWith,
    when,
  });

  /** @type {ReturnFailure<Promise<never>>} */
  const commitReject = (maker, tagCall, ...restArgs) => {
    const err = createError(maker, tagCall, ...restArgs);
    return /** @type {Promise<never>} */ (eventual.reject(err));
  };
  /** @type {FailWithGeneral<Promise<never>>} */
  const rejectWith = makeFailWith(commitReject);

  /**
   * @param {unknown} boundThis
   * @param {OCell<any>} [parentCell]
   * @param {PropertyKey} [boundName]
   */
  const makeBoundOCell = (boundThis, parentCell, boundName) => {
    let cachedThisArg;
    const getThisArg = () => {
      if (cachedThisArg === undefined) {
        if (boundName === undefined) {
          cachedThisArg = when(boundThis);
        } else {
          cachedThisArg = when(eventual.get(boundThis, boundName));
        }
      }
      return cachedThisArg;
    };

    const tgt = makeTarget(getThisArg, promiseMethodEntries);

    // Reflect the eventual handler onto `getThisArg()`.
    const evFactory = EventualFactory.delegateLazy(getThisArg);
    const cell = evFactory.newProxy(tgt, {
      apply(_target, thisArg, args) {
        if (thisArg !== undefined && thisArg !== parentCell) {
          return makeBoundOCell(
            rejectWith(TypeError)`Unexpected thisArg ${thisArg}`,
          );
        }

        if (boundName === undefined) {
          const retP = eventual.apply(boundThis, args);
          return makeBoundOCell(retP, cell);
        }

        const retP = eventual.send(boundThis, boundName, args);
        return makeBoundOCell(retP, cell);
      },
      deleteProperty(target, key) {
        if (promiseMethodNames.has(key)) {
          return false;
        }
        eventual.delete(getThisArg(), key).catch(sink);
        return Reflect.deleteProperty(target, key);
      },
      set(target, key, value, receiver) {
        if (receiver !== cell) {
          void rejectWith(
            TypeError,
          )`Unexpected receiver ${receiver} for set ${key}`;
          return false;
        }
        if (promiseMethodNames.has(key)) {
          return false;
        }
        eventual.set(getThisArg(), key, value).catch(sink);
        return Reflect.set(target, key, value);
      },
      get(_target, key, receiver) {
        if (receiver !== cell) {
          return makeBoundOCell(
            rejectWith(
              TypeError,
            )`Unexpected receiver ${receiver} for get ${key}`,
          );
        }
        if (promiseMethodNames.has(key)) {
          // Base case, escape the cell via a promise method.
          return tgt[key];
        }
        if (key === Symbol.toPrimitive) {
          // Work around a bug that somehow locks up the Node.js REPL.
          return undefined;
        }
        const thisArg = getThisArg();

        // Capture the key, since we won't know if this is a property get or a
        // method call until later.
        return makeBoundOCell(thisArg, cell, key);
      },
    });

    // harden(cell);
    return cell;
  };

  /**
   * @template T
   * @param {T} obj
   * @returns {OCell<T>}
   */
  const makeOCell = obj => makeBoundOCell(obj);

  /**
   * @template T
   * @param {T} [obj]
   * @returns {Promise<Awaited<T>> & AsyncPrimitive<T> & AsyncShallow<T> & {
   * <U>(x: U): OCell<U> }}
   */
  const makeO = (obj = {}) => {
    const identity = x => x;
    const root = Object.assign(identity, obj);
    return makeOCell(root);
  };

  eventual.client = harden(makeO());
  return harden({ EventualFactory, eventual, makeOCell, makeO });
};
harden(prepareOTools);
