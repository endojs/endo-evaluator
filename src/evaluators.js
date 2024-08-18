/* eslint-disable no-console, no-new-func */
/* globals Compartment */

// Obtuse, so that if we are loading under SES, we don't contain the syntax we
// are trying to help our caller avoid.
const htmlBeginCommentPattern = new RegExp(`(?:${'<'}!--)`, 'g');
const htmlEndCommentPattern = new RegExp(`(?:--${'>'})`, 'g');

/**
 * Use workarounds that may break the code, but at least SES will not throw
 * errors when parsing.
 *
 * @param {string} code
 */
const evade = code =>
  code
    .replace(htmlBeginCommentPattern, '<!- ')
    .replace(htmlEndCommentPattern, ' ->')
    .replace(/\bimport\b/g, '$imprt');

/**
 * @param {string} body
 * @param {string} prefix
 * @param {(code: string) => void} checkSyntax
 * @param {string} [head]
 */
const createFunctionCode = (
  body,
  prefix,
  checkSyntax,
  head = 'async () => ',
) => {
  if (typeof body !== 'string')
    throw TypeError('function body must be a string');

  const check = code => {
    // console.log('checking code syntax:', code);
    checkSyntax(code);
  };
  const evadedBody = evade(body);

  // Validate that the prefix is a statement.
  const naivePrefixCode = `${head}{${prefix};`;
  const naiveSuffixCode = `}`;
  const verifiedPrefixCode = `${head}{{${prefix};`;
  const verifiedSuffixCode = `}}`;
  check(naivePrefixCode + naiveSuffixCode);
  check(verifiedPrefixCode + verifiedSuffixCode);

  try {
    // See if the body is an expression first.
    const naiveExprCode = `${verifiedPrefixCode}return (${evadedBody}\n);${verifiedSuffixCode}`;
    const verifiedExprCode = `${verifiedPrefixCode}return ((${evadedBody}\n));${verifiedSuffixCode}`;
    check(naiveExprCode);
    check(verifiedExprCode);
    return verifiedExprCode;
  } catch (e) {
    if (e instanceof SyntaxError) {
      try {
        // Evaluate statements instead.
        const naiveStmtCode = `${naivePrefixCode}${evadedBody}\n${naiveSuffixCode}`;
        const verifiedStmtCode = `${verifiedPrefixCode}${evadedBody}\n${verifiedSuffixCode}`;
        check(naiveStmtCode);
        check(verifiedStmtCode);
        return verifiedStmtCode;
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
};

const makeUnsafeEval =
  (asyncKeyword, directives = '') =>
  async (command, endowments = {}) => {
    if (typeof command !== 'string') {
      throw Error(`command must be a string`);
    }

    const destructureEndowments = `{ ${Object.keys(endowments).join(', ')} }`;
    const prefix = `${directives}const ${destructureEndowments} = _endowments;`;

    const verifiedCode = createFunctionCode(
      command,
      prefix,
      code => {
        // Syntax check only (no evaluation).
        Function(code);
      },
      `${asyncKeyword} (_endowments) => `,
    );

    // eslint-disable-next-line no-eval
    const afn = (0, eval)(verifiedCode);
    return afn(endowments);
  };

export const unsafeSloppyAsyncEval = () => makeUnsafeEval('async ');
export const unsafeStrictAsyncEval = () =>
  makeUnsafeEval('async ', `'use strict';`);

/**
 * @param {Record<string, any>} options
 * @param {string} [asyncKeyword]
 */
const makeCompartmentEvaluate = (options, asyncKeyword) => {
  // eslint-disable-next-line no-undef
  const { globalEndowments, ...evaluationOptions } = options;
  const compartment = new Compartment(globalEndowments);

  return async (command, endowments = {}) => {
    if (typeof command !== 'string') {
      throw Error(`command must be a string`);
    }

    const destructureEndowments = `{ ${Object.keys(endowments).join(', ')} }`;
    const prefix = `const ${destructureEndowments} = _endowments;`;

    const verifiedCode = createFunctionCode(
      command,
      prefix,
      code => {
        // Syntax check only (no evaluation).
        compartment.globalThis.Function(code);
      },
      `${asyncKeyword}(_endowments) => `,
    );
    const afn = compartment.evaluate(verifiedCode, evaluationOptions);
    return afn(endowments);
  };
};

export const strictCompartmentAsyncEvaluate = (globalEndowments = {}) =>
  makeCompartmentEvaluate({ globalEndowments }, 'async ');
export const sloppyCompartmentAsyncEvaluate = (globalEndowments = {}) =>
  makeCompartmentEvaluate(
    { globalEndowments, sloppyGlobalsMode: true },
    'async ',
  );

export const detectBestEvaluator = (...args) => {
  const prioritizedEvaluators = {
    sloppyCompartmentAsyncEvaluate,
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
