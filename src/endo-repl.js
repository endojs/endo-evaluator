import { LitElement, html, css } from 'lit';
import { createRef, ref } from 'lit/directives/ref.js';

import { consoleLines } from './safe-render.js';

const just = x => JSON.stringify(x, null, 2);
const harden = x => {
  Object.freeze(x);
  return x;
};

class EndoRepl extends LitElement {
  static properties = {
    header: { type: String },
    history: { type: Array },
  };

  static styles = css`
    * {
      padding: 0;
      margin: 0;
      box-sizing: border-box;
    }

    h1 {
      text-align: center;
      margin-top: 40px;
    }

    .container {
      display: flex;
      flex-direction: column;
      padding: 10px;
      height: 100%;
      overflow-y: auto;
    }

    .ui {
      display: flex;
      flex-direction: row;
      flex-wrap: wrap;
      align-items: stretch;
      height: 100%;
      justify-content: space-between;
    }

    .left {
      flex-grow: 1;
      flex-shrink: 0;
      padding: 10px;
    }

    .frame {
      display: none;
      min-height: 50%;
      min-width: 600px;
      margin: 0px;
      padding: 0px;
      overflow-y: auto;
    }

    .right {
      width: 600px;
      flex-grow: 1;
      flex-shrink: 1;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      overflow-y: auto;
      padding: 10px;
    }

    .updated {
      animation-name: spin;
      animation-duration: 2000ms;
      animation-iteration-count: 1;
    }

    @keyframes spin {
      from {
        transform: rotate(0deg);
      }

      to {
        transform: rotate(360deg);
      }
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
    input {
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

    * {
      padding: 0;
      margin: 0;
      box-sizing: border-box;
    }
    main {
      flex-grow: 1;
    }

    .logo {
      margin-top: 36px;
      animation: app-logo-spin infinite 20s linear;
    }

    @keyframes app-logo-spin {
      from {
        transform: rotate(0deg);
      }
      to {
        transform: rotate(360deg);
      }
    }

    .app-footer {
      font-size: calc(12px + 0.5vmin);
      align-items: center;
    }

    .app-footer a {
      margin-left: 5px;
    }
  `;

  constructor() {
    super();
    this.header = 'My app';
    this.history = [];
  }

  #nextHistNum = 0;

  #inputHistoryNum = 0;

  #refs = {};

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
      throw Error(`deref(${name}) failed: ref cell is not set`);
    }
    const { value } = refCell;
    if (!value) {
      throw Error(`deref(${name}) failed: ref.value is unset`);
    }
    return value;
  }

  #setNextHistNum(max = 0) {
    const thisHistNum = this.#nextHistNum;
    this.#nextHistNum = Math.max(thisHistNum, max);
    this.#inputHistoryNum = thisHistNum;
    return thisHistNum;
  }

  /**
   * @param {number} histnum
   * @param {string} command
   * @param {any} result
   * @param {{ command?: string, display?: string }} [consoles]
   */
  #updateHistory(histnum, command, result, consoles = {}) {
    const h = this.#deref('history');
    const isScrolledToBottom =
      h.scrollHeight - h.clientHeight <= h.scrollTop + 1;

    const ent = harden({ command, result, consoles: harden(consoles) });
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
    console.debug('submitEval', command);
    const number = this.#setNextHistNum(this.#nextHistNum + 1);
    this.#updateHistory(number, command, `sending for eval...`);
    input.value = '';

    this.#updateHistory(number, command, `evaluating...`);
    const updateResult = ({ display }) =>
      this.#updateHistory(number, command, display);
    Promise.resolve(this.#unsafeEval(command)).then(updateResult, updateResult);
  }

  // eslint-disable-next-line class-methods-use-this
  async #unsafeEval(command) {
    try {
      if (typeof command !== 'string') {
        throw Error(`command must be a string`);
      }

      // eslint-disable-next-line no-eval
      const ret = await (0, eval)(
        `async (command) => { return (${command}\n) }`,
      )(
        this.history.map(({ command: cmd }) => cmd),
        this.history.map(({ result }) => result),
      );
      return { display: just(ret) };
    } catch (err) {
      return {
        display: `Promise.reject(${just((err && err.message) || err)})`,
      };
    }
  }

  #inputKeyup(ev) {
    switch (ev.key) {
      case 'Enter':
        this.#submitEval();
        return false;

      case 'ArrowUp':
        this.#inputHistory(-1);
        return false;

      case 'ArrowDown':
        this.#inputHistory(+1);
        return false;

      case 'p':
        if (ev.ctrlKey) {
          this.#inputHistory(-1);
          return false;
        }
        break;

      case 'n':
        if (ev.ctrlKey) {
          this.#inputHistory(+1);
          return false;
        }
        break;

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
      <div class="container">
        <main class="ui">
          <div class="right">
            <div class="help">
              Use <code>home</code> to see useful objects, and
              <code>history[N]</code> to refer to result history
            </div>
            <div id="history" ${this.#mkref('history')} class="history"></div>
            <div class="history">
              ${this.history.map(({ command, result, consoles }, histnum) =>
                [
                  {
                    kind: 'command',
                    display: command,
                    msgs: consoles.command || '',
                  },
                  {
                    kind: 'history',
                    display: result,
                    msgs: consoles.display || '',
                  },
                ].map(
                  ({ kind, display, msgs }) =>
                    html`<div class="${kind}-line">
                        <div>${kind}[${histnum}]</div>
                        <div .innerHTML=${consoleLines(display)}></div>
                      </div>
                      <div class="msg-line">
                        <div></div>
                        <div .innerHTML=${consoleLines(msgs)}></div>
                      </div>`,
                ),
              )}
              <div id="command-entry" class="command-line">
                <div>command[${this.#inputHistoryNum}]</div>
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
        </main>
        <address>
          Source:
          <a
            target="_blank"
            href="https://github.com/endojs/endo/packages/repl/"
            id="package_repo"
            ><span id="package_name">endo-repl</span></a
          >
        </address>
      </div>
    `;
  }
}

customElements.define('endo-repl', EndoRepl);
