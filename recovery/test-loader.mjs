import { registerHooks } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from '../site/node_modules/typescript/lib/typescript.js';

// Run the original tests without rewriting their extensionless TypeScript imports.
// Live network access is disabled; individual suites provide their own AI mocks.
globalThis.fetch = async () => { throw new Error('Recovery verification: live network disabled'); };
delete process.env.OPENAI_API_KEY;
registerHooks({
  resolve(specifier, context, nextResolve) {
    try { return nextResolve(specifier, context); }
    catch (error) {
      if (!specifier.startsWith('.') && !specifier.startsWith('@/')) throw error;
      const base = specifier.startsWith('@/')
        ? new URL('../site/' + specifier.slice(2), import.meta.url)
        : new URL(specifier, context.parentURL);
      for (const suffix of ['.ts', '.tsx', '.mts', '/index.ts']) {
        const candidate = fileURLToPath(base) + suffix;
        if (existsSync(candidate)) return nextResolve(pathToFileURL(candidate).href, context);
      }
      throw error;
    }
  },
  load(url, context, nextLoad) {
    if (/\.(?:ts|tsx|mts)$/.test(url) && !url.includes('/node_modules/')) {
      return {format: 'module', shortCircuit: true, source: ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
        fileName: fileURLToPath(url), compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX}
      }).outputText};
    }
    return nextLoad(url, context);
  }
});
