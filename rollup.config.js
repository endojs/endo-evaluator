/* eslint-disable no-use-before-define */
import nodeResolve from '@rollup/plugin-node-resolve';
import babel from '@rollup/plugin-babel';
import { rollupPluginHTML as html } from '@web/rollup-plugin-html';
import { importMetaAssets } from '@web/rollup-plugin-import-meta-assets';
import esbuild from 'rollup-plugin-esbuild';
import { generateSW } from 'rollup-plugin-workbox';
import path from 'path';

export default {
  input: 'index.html',
  output: {
    entryFileNames: '[hash].js',
    chunkFileNames: '[hash].js',
    assetFileNames: '[hash][extname]',
    format: 'es',
    dir: 'dist',
  },
  preserveEntrySignatures: false,

  plugins: [
    /** Enable using HTML as rollup entrypoint */
    html({
      minify: true,
      injectServiceWorker: true,
      serviceWorkerPath: 'dist/sw.js',
      transformHtml: [
        source =>
          source.replace(
            /<script type=(["']?)importmap\1.*?>(\n?.*?)*?<\/script>/g,
            '',
          ),
      ],
    }),
    /** Resolve bare module imports */
    nodeResolveWithImportmap({
      importmap: {
        imports: {
          '@endo/o': './src/endo-o.js',
        },
      },
      nodeResolver: nodeResolve(),
    }),
    /** Minify JS, compile JS to a lower language target */
    esbuild({
      minify: false,
      // exclude: ['@endo/init'],
      target: 'es2021', // ['chrome64', 'firefox67', 'safari11.1'],
    }),
    /** Bundle assets references via import.meta.url */
    importMetaAssets(),
    /** Minify html and css tagged template literals */
    babel({
      plugins: [
        [
          'babel-plugin-template-html-minifier',
          {
            modules: {
              lit: ['html', { name: 'css', encapsulation: 'style' }],
            },
            failOnError: false,
            strictCSS: true,
            htmlMinifier: {
              collapseWhitespace: true,
              conservativeCollapse: true,
              removeComments: true,
              caseSensitive: true,
              minifyCSS: true,
            },
          },
        ],
      ],
    }),
    /** Create and inject a service worker */
    generateSW({
      globIgnores: ['polyfills/*.js', 'nomodule-*.js'],
      navigateFallback: '/index.html',
      // where to output the generated sw
      swDest: path.join('dist', 'sw.js'),
      // directory to match patterns against to be precached
      globDirectory: path.join('dist'),
      // cache any html js and css by default
      globPatterns: ['**/*.{html,js,css,webmanifest}'],
      skipWaiting: true,
      clientsClaim: true,
      runtimeCaching: [{ urlPattern: 'polyfills/*.js', handler: 'CacheFirst' }],
    }),
  ],
};

/**
 * @param {object} options
 * @param {{imports: Record<string, string>}} options.importmap
 * @param {ReturnType<import('@rollup/plugin-node-resolve').default>} options.nodeResolver
 */
function nodeResolveWithImportmap({ importmap, nodeResolver } = {}) {
  const handlerProxy = new Proxy(nodeResolver.resolveId.handler, {
    apply: (target, thisArg, handlerArguments) =>
      typeof importmap?.imports?.[handlerArguments[0]] === 'string'
        ? importmap.imports[handlerArguments[0]]
        : Reflect.apply(target, thisArg, handlerArguments),
  });

  const resolveIdProxy = new Proxy(nodeResolver.resolveId, {
    get: (target, prop, receiver) =>
      prop === 'handler' ? handlerProxy : Reflect.get(target, prop, receiver),
  });

  const nodeResolveOverrides = {
    name: 'node-resolve-with-importmap',
    resolveId: resolveIdProxy,
  };

  return new Proxy(nodeResolver, {
    has: (target, prop) =>
      prop in nodeResolveOverrides || Reflect.has(target, prop),
    get: (target, prop, receiver) =>
      prop in nodeResolveOverrides
        ? nodeResolveOverrides[prop]
        : Reflect.get(target, prop, receiver),
  });
}
