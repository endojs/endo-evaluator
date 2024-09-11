/* eslint-disable no-new */
/* global globalThis */

/**
 * @import { HandledPromiseConstructor } from '@endo/eventual-send';
 */

const {
  defineProperties,
  entries,
  freeze,
  fromEntries,
  getOwnPropertyDescriptors,
  getPrototypeOf,
  setPrototypeOf,
} = Object;

/**
 * @type {<T>(x: T) => T}
 */
const harden = globalThis.harden || freeze;

/**
 *
 * @param {object} _zone
 * @param {object} powers
 * @param {HandledPromiseConstructor} powers.HandledPromise
 * @param {(resolution: any) => unknown} powers.makeStep
 * @param {(specimen: unknown) => Promise<any>} powers.when
 */
const preparePromiseEventual = (_zone, { HandledPromise, makeStep, when }) => {
  /**
   * @template {keyof HandledPromiseConstructor} K
   * @template {(...args: any[]) => any} [F=HandledPromiseConstructor[K]]
   * @param {K} hpProp
   * @param {F} fallback
   * @returns {F}
   */
  const bindProp = (hpProp, fallback) =>
    HandledPromise?.[hpProp]?.bind(HandledPromise) || fallback;
  const eventual = {
    get: bindProp('get', (x, prop) => when(x).then(y => y[prop])),
    apply: bindProp('applyFunction', (x, args) =>
      when(x).then(y => y(...args)),
    ),
    send: bindProp('applyMethod', (x, prop, args) => {
      if (prop === undefined) {
        return eventual.apply(x, args);
      }
      return when(x).then(y => y[prop](...args));
    }),
    delete: bindProp(
      'delete',
      /**
       * @param {unknown} x
       * @param {PropertyKey} prop
       * @returns {Promise<boolean>}
       */
      (x, prop) =>
        when(x).then(
          y =>
            // eslint-disable-next-line no-param-reassign
            delete y[prop],
        ),
    ),
    set: bindProp(
      'set',
      /**
       * @param {unknown} x
       * @param {PropertyKey} prop
       * @param {any} value
       * @returns {Promise<boolean>}
       */
      (x, prop, value) =>
        when(x).then(y => {
          // eslint-disable-next-line no-param-reassign
          y[prop] = value;
          return value;
        }),
    ),
    reject: bindProp('reject', reason => Promise.reject(reason)),
    resolve: bindProp('resolve', result => Promise.resolve(result)),
    makeStep: bindProp('makeStep', result => makeStep(result)),
  };
  return eventual;
};

const prepareEventualFactory = (
  _zone,
  { throwWith, HandledPromise, eventual },
) => {
  // XXX This hack is a temporary workaround until we can create eventual
  // Proxies without triggering a call to the handler's `.then` method.
  const wrapWithEnabler = target => {
    let disabled = true;
    const enablerHandler = {
      get(t, prop, receiver) {
        if (disabled) {
          return undefined;
        }
        return Reflect.get(t, prop, receiver);
      },
    };
    const wrapper = new Proxy(target, enablerHandler);
    const enable = () => {
      disabled = false;
    };
    return { wrapper, enable };
  };

  class EventualFactory {
    #hpHandler;

    static delegateLazy(getTarget, handler) {
      const bound = prop => {
        // console.log('eventual bound', prop);
        const propHandler = handler?.[prop];
        if (typeof propHandler === 'function') {
          return propHandler.bind(handler);
        }
        return eventual[prop].bind(eventual);
      };

      const delegatedHandler = {
        apply(_x, args, opts) {
          return bound('apply')(getTarget(), args, opts);
        },
        delete(_x, prop, opts) {
          return bound('delete')(getTarget(), prop, opts);
        },
        get(_x, prop, opts) {
          return bound('get')(getTarget(), prop, opts);
        },
        send(_x, prop, args, opts) {
          return bound('send')(getTarget(), prop, args, opts);
        },
        set(_x, prop, value, opts) {
          return bound('set')(getTarget(), prop, value, opts);
        },
      };
      return new EventualFactory(delegatedHandler);
    }

    static delegate(target, handler) {
      return EventualFactory.delegateLazy(() => target, handler);
    }

    constructor(evHandler) {
      this.#hpHandler = fromEntries(
        entries(evHandler).map(([k, v]) => {
          let hpProp;
          switch (k) {
            case 'apply':
              hpProp = 'applyFunction';
              break;
            case 'send':
              hpProp = 'applyMethod';
              break;
            case 'get':
            case 'delete':
            case 'set':
              hpProp = k;
              break;
            default: {
              throw throwWith`Cannot map EventualFactory method ${k} to HandledPromise`;
            }
          }
          if (typeof v === 'function') {
            return [hpProp, v.bind(evHandler)];
          }
          return [k, v];
        }),
      );
      harden(this);
    }

    promiseResolve(x) {
      return new HandledPromise(resolve => resolve(x), this.#hpHandler);
    }

    /**
     * @param {object} proto
     * @param {PropertyDescriptorMap} props
     * @returns {object}
     */
    objectCreate(proto, props) {
      let obj;
      new HandledPromise((_res, _rej, resolveWithPresence) => {
        obj = resolveWithPresence(this.#hpHandler);
        setPrototypeOf(obj, proto);
        if (props) {
          defineProperties(obj, props);
        }
      });
      return obj;
    }

    /**
     * @template T
     * @param {T} resolution
     * @returns {unknown}
     */
    makeStep(resolution) {
      let step;
      const rawStep = eventual.makeStep(resolution);
      new HandledPromise((_res, _rej, resolveWithPresence) => {
        step = resolveWithPresence(this.#hpHandler);
        setPrototypeOf(step, getPrototypeOf(rawStep));
        defineProperties(step, getOwnPropertyDescriptors(rawStep));
      });
      return step;
    }

    /**
     * @template {object} T
     * @param {T} target
     * @param {ProxyHandler<T>} handler
     * @returns {T}
     */
    newProxy(target, handler) {
      return this.#makeProxy(target, handler, false);
    }

    /**
     * @template {object} T
     * @param {T} target
     * @param {ProxyHandler<T>} handler
     * @returns {ReturnType<typeof Proxy.revocable<T>>}
     */
    proxyRevocable(target, handler) {
      return this.#makeProxy(target, handler, true);
    }

    #makeProxy(target, handler, isRevocable) {
      /** @type {object} */
      let proxy;
      let revoke;
      let revokerCallback = r => {
        revoke = r;
      };
      if (!isRevocable) {
        revokerCallback = undefined;
      }
      new HandledPromise((_res, _rej, resolveWithPresence) => {
        // This disabled wrapper is to prevent the `.then` handler from being
        // called as part of `resolveWithPresence` trying to sniff if it's a
        // promise.
        const { enable, wrapper } = wrapWithEnabler(handler);
        try {
          const proxyOpts = {
            proxy: { target, handler: wrapper, revokerCallback },
          };
          proxy = resolveWithPresence(this.#hpHandler, proxyOpts);
        } finally {
          enable();
        }
      });
      if (isRevocable) {
        return { proxy, revoke };
      }
      return proxy;
    }
  }
  harden(EventualFactory);
  return EventualFactory;
};

/**
 * @param {import('@agoric/base-zone').Zone} zone
 * @param {*} param1
 */
export const prepareEventualTools = (
  zone,
  { HandledPromise, throwWith, makeStep, when },
) => {
  const eventual = preparePromiseEventual(zone, {
    HandledPromise,
    makeStep,
    when,
  });
  const EventualFactory = prepareEventualFactory(zone, {
    HandledPromise,
    throwWith,
    when,
    eventual,
  });

  return { Promise: { eventual }, EventualFactory };
};
harden(prepareEventualTools);
