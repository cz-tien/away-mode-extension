import { build, context } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('dist/panel', { recursive: true });
for (const file of ['manifest.json', 'panel/index.html', 'panel/panel.css']) await copyFile(`src/${file}`, `dist/${file}`);
const options = {entryPoints: {background:'src/background.ts', content:'src/content/amazon.ts', 'panel/panel':'src/panel/panel.ts'}, outdir:'dist', bundle:true, target:'chrome116', sourcemap:false, format:'iife'};
if (process.argv.includes('--watch')) { const ctx = await context(options); await ctx.watch(); } else await build(options);
