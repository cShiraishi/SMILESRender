import type { BuildConfig } from 'bun';

// Build workers first as separate bundles
const workers = ['prediction.worker', 'pkcsm.worker', 'admetlab.worker'];

for (const name of workers) {
  const result = await Bun.build({
    entrypoints: [`./src/frontend/workers/${name}.ts`],
    outdir: './src/static/build',
    minify: true,
    target: 'browser',
    format: 'esm',
    env: 'inline',
  } as BuildConfig);

  if (!result.success) {
    console.log(`[ ERR ] Worker build failed: ${name}`);
    for (const log of result.logs) console.log('Error: ', log);
    process.exit(1);
  }
}

// Build main bundle
const output = await Bun.build({
  entrypoints: ['./src/frontend/index.tsx'],
  outdir: './src/static/build',
  minify: true,
  target: 'browser',
  format: 'esm',
  env: 'inline',
} as BuildConfig);

if (!output.success) {
  console.log('[ ERR ] - Seems that we have some problems at the build...');
  for (const log of output.logs) console.log('Error: ', log);
  process.exit(1);
} else {
  console.log('[ OK ] - Success!');
  for (const log of output.outputs) console.log('Output: ', log);
}
