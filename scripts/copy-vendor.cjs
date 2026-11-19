#!/usr/bin/env node
/**
 * Copia a public/vendor/ los scripts de terceros que el navegador necesita servidos desde NUESTRO dominio
 * (la CSP no permite CDNs externos). Corre solo antes de `dev` y `build` (scripts predev / prebuild).
 *
 *  - browser-image-compression: su Web Worker hace importScripts() de la librería; por defecto la baja de
 *    cdn.jsdelivr.net. La servimos local (misma versión que package-lock.json).
 */
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const out = path.join(root, "public", "vendor");
const files = [["node_modules/browser-image-compression/dist/browser-image-compression.js", "browser-image-compression.js"]];

fs.mkdirSync(out, { recursive: true });
for (const [from, to] of files) fs.copyFileSync(path.join(root, from), path.join(out, to));
console.log(`vendor: ${files.length} archivo(s) en public/vendor`);
