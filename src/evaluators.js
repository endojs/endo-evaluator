const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

const makeUnsafeAsyncEval =
  (directives = '') =>
  async (command, endowments = {}) => {
    if (typeof command !== 'string') {
      throw Error(`command must be a string`);
    }

    const destructureEndowments = `{ ${Object.keys(endowments).join(', ')} }`;
    const prefix = `${directives}const ${destructureEndowments} = _endowments;`;

    let afn;
    try {
      // Try an expression first.
      afn = new AsyncFunction('_endowments', `${prefix}return (${command}\n)`);
    } catch (e) {
      if (e instanceof SyntaxError) {
        try {
          // Evaluate statements instead.
          afn = new AsyncFunction('_endowments', `${prefix}${command}`);
        } catch (e2) {
          if (e2 instanceof SyntaxError) {
            throw e;
          }
          throw e2;
        }
      } else {
        throw e;
      }
    }

    return afn(endowments);
  };

export const unsafeSloppyAsyncEval = () => makeUnsafeAsyncEval();
export const unsafeStrictAsyncEval = () => makeUnsafeAsyncEval(`'use strict';`);

const makeCompartmentEvaluate = options => {
  // eslint-disable-next-line no-undef
  const compartment = new Compartment();

  return async (command, endowments = {}) => {
    if (typeof command !== 'string') {
      throw Error(`command must be a string`);
    }

    Object.defineProperties(
      compartment.globalThis,
      Object.getOwnPropertyDescriptors(endowments),
    );

    let afn;
    try {
      // Try an expression first.
      afn = compartment.evaluate(`async () => (${command}\n)`, options);
    } catch (e) {
      if (e instanceof SyntaxError) {
        try {
          // Evaluate statements instead.
          afn = compartment.evaluate(`async () => { ${command}\n}`, options);
        } catch (e2) {
          if (e2 instanceof SyntaxError) {
            throw e;
          }
          throw e2;
        }
      } else {
        throw e;
      }
    }

    return afn();
  };
};

export const strictCompartmentEvaluate = () => makeCompartmentEvaluate();
export const sloppyCompartmentEvaluate = () =>
  makeCompartmentEvaluate({ sloppyGlobalsMode: true });

export const detectBestEvaluator = (...args) => {
  const prioritizedEvaluators = {
    sloppyCompartmentEvaluate,
    unsafeSloppyAsyncEval,
  };
  for (const [name, evaluator] of Object.entries(prioritizedEvaluators)) {
    try {
      console.info(`attempting evaluator="${name}"`);
      const ev = evaluator(...args);
      console.info(`successful evaluator="${name}"`);
      return ev;
    } catch (e) {
      console.warn(`evaluator="${name}" failed:`, e);
    }
  }
  throw Error(`no evaluator available`);
};

export default detectBestEvaluator.name;
