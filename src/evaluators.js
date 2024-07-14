const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

export const sloppyAsyncEval = async (command, endowments = {}) => {
  if (typeof command !== 'string') {
    throw Error(`command must be a string`);
  }

  const endowedArg = `{ ${Object.keys(endowments).join(', ')} }`;

  let afn;
  try {
    // Try an expression first.
    afn = new AsyncFunction(endowedArg, `return (${command}\n)`);
  } catch (e) {
    if (e instanceof SyntaxError) {
      // Use statements instead.
      afn = new AsyncFunction(endowedArg, command);
    } else {
      throw e;
    }
  }

  return afn(endowments);
};
