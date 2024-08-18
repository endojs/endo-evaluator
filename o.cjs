#! /usr/bin/env node -r
/* global globalThis */
console.log(
  'Access properties and methods of O, or an arbitrary object with O(x)',
);

process.env.LOCKDOWN_ERROR_TRAPPING = 'report';
import('@endo/init')
  .then(() => import('./src/endo-o.js'))
  .then(({ prepareOTools }) => {
    const { makeO } = prepareOTools(null);

    const O = makeO({
      help: 'This is a help message',
    });

    globalThis.O = O;
  });
