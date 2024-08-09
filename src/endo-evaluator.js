import { LitElement, html, css } from 'lit';
import { createRef, ref } from 'lit/directives/ref.js';

import { consoleLines, harden } from './safe-render.js';
import defaultEvaluatorMakerName, * as evaluatorMakers from './evaluators.js';

class EndoEvaluator extends LitElement {
  static properties = {
    history: { type: Array },
    evaluator: {},
  };

  static styles = css`
    * {
      padding: 0;
      margin: 0;
      box-sizing: border-box;
    }

    :host {
      height: 100%;
      width: 100%;
    }

    .repl {
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      overflow-y: auto;
    }

    h1 {
      text-align: center;
      margin-top: 40px;
    }

    .help {
      border-bottom: 1px solid black;
    }

    #history {
      overflow-y: auto;
      overflow-x: hidden;
      flex-basis: 0;
      flex-grow: 1;
    }
    .history {
      border-spacing: 0;
      font-family: 'Roboto Mono', monospace;
      font-size: 14px;
      font-weight: 400;
    }

    .history > div {
      display: grid;
      grid-template-columns: 100px auto;
      grid-column-gap: 0;
    }

    .history > .command-line {
      background: #dbfaf9;
      font-weight: 500;
      padding-top: 3px;
      padding-bottom: 3px;
      overflow-wrap: anywhere;
    }

    .history > .history-line {
      padding-bottom: 12px;
      overflow-wrap: anywhere;
    }

    .history > .msg-line {
      background: antiquewhite;
      font-style: oblique;
      overflow-wrap: anywhere;
    }

    .history > div > .command-line :first-child,
    .history > div > .history-line :first-child {
      text-align: right;
      color: #424248;
    }

    .history > div > .command-line :nth-child(2),
    .history > div > .history-line :nth-child(2) {
      text-align: left;
      padding-left: 8px;
      /* Overflow must be set (to auto or hidden) to force the word break to apply.
         The word-wrap is required to wrap a long value with no spaces. */
      overflow: hidden;
      word-wrap: break-word;
    }

    #command-entry {
      grid-template-columns: 100px auto 60px;
      min-width: 260px;
      align-items: baseline;
    }

    /* For command entry and eval button. */
    input,
    textarea {
      font-family: 'Roboto Mono', monospace;
      font-size: 14px;
      width: 100%;
      border: 1px solid gray;
    }

    input[type='text']:focus {
      border-color: #428f87;
    }

    input[type='submit'] {
      color: white;
      background: #428f87;
      border-radius: 4px;
    }
  `;

  constructor() {
    super();
    this.just = x => String(x);
    this.history = [];
    this.evaluator = defaultEvaluatorMakerName;
  }

  endowments = {};

  #nextHistNum = 0;

  #inputHistoryNum = 0;

  #results = [];

  #refs = {};

  evaluate = null;

  #evaluatorName = null;

  set evaluator(val) {
    if (!evaluatorMakers[val]) {
      throw Error(`evaluator maker ${val} not found`);
    }
    this.#evaluatorName = val;
  }

  get evaluator() {
    return this.#evaluatorName;
  }

  /**
   * @param {string} name
   * @returns {ReturnType<typeof ref>}
   */
  #mkref(name) {
    const refCell = createRef();
    this.#refs[name] = refCell;
    return ref(refCell);
  }

  /**
   *
   * @param {string} name
   * @returns {Element}
   */
  #deref(name) {
    /** @type {{ value?: Element }} */
    const refCell = this.#refs[name];
    if (!refCell) {
      return undefined;
    }
    const { value } = refCell;
    return value;
  }

  #setNextHistNum(max = 0) {
    const thisHistNum = this.#nextHistNum;
    this.#nextHistNum = Math.max(thisHistNum, max);
    this.#inputHistoryNum = this.#nextHistNum;
    return thisHistNum;
  }

  #makeInlineConsole(number) {
    const sendToConsole = (...args) => {
      const {
        consoles: { display: cdisplay = '', ...restConsoles } = {},
        command,
        display,
      } = this.history[number] || {};

      let msgs = cdisplay;
      if (msgs) {
        msgs += '\n';
      }
      msgs += args
        .map(o => (typeof o === 'string' ? o : this.just(o)))
        .join(' ');

      this.#updateHistory(number, command, display, this.#results[number], {
        ...restConsoles,
        display: msgs,
      });
    };
    const inlineConsole = Object.fromEntries(
      ['debug', 'log', 'info', 'warn', 'error'].map(severity => [
        severity,
        sendToConsole,
      ]),
    );
    return inlineConsole;
  }

  /**
   * @param {number} histnum
   * @param {string} command
   * @param {string} display
   * @param {any} result
   * @param {{ command?: string, display?: string }} [consoles]
   */
  #updateHistory(histnum, command, display, result, consoles = null) {
    const h = this.#deref('history');
    const isScrolledToBottom =
      h && h.scrollHeight - h.clientHeight <= h.scrollTop + 1;

    this.#results[histnum] = result;
    const ent = harden({
      command,
      display,
      consoles: harden(consoles) || this.history[histnum]?.consoles,
    });
    this.history = harden([
      ...this.history.slice(0, histnum),
      ent,
      ...this.history.slice(histnum + 1),
    ]);

    if (isScrolledToBottom) {
      setTimeout(() => {
        h.scrollTop = h.scrollHeight;
      }, 0);
    }
  }

  #submitEval() {
    const input = /** @type {HTMLInputElement} */ (this.#deref('input'));
    const command = input.value;
    // console.debug('submitEval', command);
    const number = this.#setNextHistNum(this.#nextHistNum + 1);

    const fulfilled = value =>
      this.#updateHistory(number, command, this.just(value), value);
    const rejected = err =>
      this.#updateHistory(
        number,
        command,
        `Promise.reject(${this.just(err)})`,
        Promise.reject(err),
      );

    const cmd = Object.create(null);
    const ncmds = this.history.length;
    for (let i = 0; i < ncmds; i += 1) {
      const c = this.history[i].command;
      cmd[i] = c;
    }

    const results = Object.create(null);
    const nresults = this.#results.length;
    for (let i = 0; i < nresults; i += 1) {
      const r = this.#results[i];
      results[i] = r;
    }

    const endowments = {
      $: Object.seal(results),
      $_: this.#results.at(-1),
      cmd: harden(cmd),
      console: this.#makeInlineConsole(number),
      ...this.endowments,
    };

    if (this.evaluate == null) {
      this.evaluate = evaluatorMakers[this.#evaluatorName]();
    }
    input.value = '';
    const retP = this.evaluate(command, endowments);
    this.#updateHistory(number, command, `Promise.resolve(<pending>)`, retP);
    retP.then(fulfilled, rejected).catch(rejected);
  }

  #inputKeyup(ev) {
    switch (ev.key) {
      case 'Enter': {
        this.#submitEval();
        return false;
      }

      case 'ArrowUp': {
        this.#inputHistory(-1);
        return false;
      }

      case 'ArrowDown': {
        this.#inputHistory(+1);
        return false;
      }

      case 'p': {
        if (ev.ctrlKey) {
          this.#inputHistory(-1);
          return false;
        }
        break;
      }

      case 'n': {
        if (ev.ctrlKey) {
          this.#inputHistory(+1);
          return false;
        }
        break;
      }

      // Do the standard behaviour.
      default:
    }
    return true;
  }

  #inputHistory(delta) {
    const nextInput = this.#inputHistoryNum + delta;
    if (nextInput < 0 || nextInput >= this.history.length) {
      // Do nothing.
      return;
    }
    this.#inputHistoryNum = nextInput;
    /** @type {HTMLInputElement} */ (this.#deref('input')).value =
      this.history[nextInput].command;
  }

  render() {
    return html`
      <div class="repl">
        <div class="help">
          <slot name="help">
            Welcome to the Evaluator! Use <code>$_</code> for the prior result
            (or <code>$[N]</code> for any other result by its entry number
            <code>N</code>).
            <slot name="hint"></slot>
          </slot>
        </div>
        <div id="history" ${this.#mkref('history')} class="history">
          ${this.history.map(({ command, display, consoles }, histnum) =>
            [
              {
                kind: 'command',
                display: command,
                msgs: consoles?.command || '',
              },
              {
                kind: 'history',
                display,
                msgs: consoles?.display || '',
              },
            ].map(
              ({ kind, display: disp, msgs }) =>
                html`<div class="${kind}-line">
                    <div>
                      ${kind === 'history'
                        ? `$[${histnum}] =`
                        : `cmd[${histnum}]>`}
                    </div>
                    <div .innerHTML=${consoleLines(disp)}></div>
                  </div>
                  <div class="msg-line">
                    <div></div>
                    <div .innerHTML=${consoleLines(msgs)}></div>
                  </div>`,
            ),
          )}
        </div>
        <div class="history">
          <div id="command-entry" class="command-line">
            <div>cmd[${this.#inputHistoryNum}]&gt;</div>
            <div>
              <input
                id="input"
                ${this.#mkref('input')}
                @keyup="${this.#inputKeyup}"
                tabindex="0"
                type="text"
              />
            </div>
            <div>
              <input
                id="go"
                @click="${this.#submitEval}"
                tabindex="0"
                type="submit"
                value="eval"
              />
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('endo-evaluator', EndoEvaluator);
