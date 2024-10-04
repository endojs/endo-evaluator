#! /usr/bin/env node --import
/* global globalThis */

import './src/pre-lockdown.js';
import './src/maybe-lockdown.js';
import { makeHeapZone } from '@agoric/base-zone/heap.js';
import { prepareOTools } from './src/endo-o.js';

const oZone = makeHeapZone();
const { makeO } = prepareOTools(oZone);

const O = makeO({
  help: 'This is a help message',
});

globalThis.O = O;
// eslint-disable-next-line no-console
console.log(
  'Access properties and methods of O, or an arbitrary object with O(x)',
);
