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
        // Evaluate statements instead.
        afn = new AsyncFunction('_endowments', `${prefix}${command}`);
      } else {
        throw e;
      }
    }

    return afn(endowments);
  };

export const unsafeSloppyAsyncEval = () => makeUnsafeAsyncEval();
export const unsafeStrictAsyncEval = () => makeUnsafeAsyncEval(`'use strict';`);

export default unsafeStrictAsyncEval.name;
