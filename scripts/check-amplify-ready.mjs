#!/usr/bin/env node
/**
 * Valida se o front está pronto para build no AWS Amplify Hosting.
 * Rode antes de commit/push em main: `yarn check:amplify`
 *
 * Falhas típicas que este script pega:
 * - Node local < engines.node (ex.: Amplify default 22 vs firebase AI >=24.12)
 * - amplify.yml sem nvm install/use alinhado ao .nvmrc
 * - ausência de yarn.lock (fonte de verdade do Amplify)
 */
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIN_NODE = '24.12.0';

function fail(msg) {
  console.error(`\n[check:amplify] FAIL: ${msg}\n`);
  process.exit(1);
}

function ok(msg) {
  console.log(`[check:amplify] OK: ${msg}`);
}

function parseSemver(v) {
  const m = String(v).replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function gte(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return false;
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] > pb[i]) return true;
    if (pa[i] < pb[i]) return false;
  }
  return true;
}

const nodeVersion = process.versions.node;
if (!gte(nodeVersion, MIN_NODE)) {
  fail(
    `Node ${nodeVersion} < ${MIN_NODE}. firebase/@firebase/ai quebra no Amplify com Node 22. Use nvm: \`nvm use\` (.nvmrc=${MIN_NODE}).`
  );
}
ok(`Node ${nodeVersion} >= ${MIN_NODE}`);

const nvmrcPath = join(root, '.nvmrc');
if (!existsSync(nvmrcPath)) {
  fail('Falta .nvmrc na raiz (esperado 24.12.0).');
}
const nvmrc = readFileSync(nvmrcPath, 'utf8').trim();
if (!gte(nvmrc, MIN_NODE)) {
  fail(`.nvmrc="${nvmrc}" < ${MIN_NODE}.`);
}
ok(`.nvmrc=${nvmrc}`);

const amplifyPath = join(root, 'amplify.yml');
if (!existsSync(amplifyPath)) {
  fail('Falta amplify.yml na raiz.');
}
const amplify = readFileSync(amplifyPath, 'utf8');
if (!/nvm install\s+24(\.\d+\.\d+)?/.test(amplify) || !/nvm use\s+24(\.\d+\.\d+)?/.test(amplify)) {
  fail(
    'amplify.yml precisa de `nvm install 24.x` e `nvm use 24.x` no preBuild (Amplify default Node 22 quebra yarn install com firebase).'
  );
}
if (!/baseDirectory:\s*dist/.test(amplify)) {
  fail('amplify.yml artifacts.baseDirectory deve ser `dist` (Vite).');
}
if (!/yarn (install|run build)/.test(amplify)) {
  fail('amplify.yml deve usar yarn install + yarn run build.');
}
ok('amplify.yml (Node 24 + yarn + dist)');

const yarnLock = join(root, 'yarn.lock');
if (!existsSync(yarnLock)) {
  fail('Falta yarn.lock — Amplify usa yarn --frozen-lockfile.');
}
ok('yarn.lock presente');

const pkgPath = join(root, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const enginesNode = pkg.engines?.node;
if (!enginesNode) {
  fail('package.json sem engines.node (ex.: ">=24.12.0").');
}
ok(`package.json engines.node="${enginesNode}"`);

const skipBuild = process.argv.includes('--skip-build');
if (skipBuild) {
  ok('skip build (--skip-build)');
  console.log('\n[check:amplify] pronto (sem build).\n');
  process.exit(0);
}

console.log('[check:amplify] rodando yarn run build (mesmo comando do Amplify)...');
const result = spawnSync('yarn', ['run', 'build'], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32',
});

if (result.status !== 0) {
  fail(`yarn run build falhou (exit ${result.status}). Não faça push para main até corrigir.`);
}

ok('yarn run build');
console.log('\n[check:amplify] Amplify-ready.\n');
process.exit(0);
