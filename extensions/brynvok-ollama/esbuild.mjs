import esbuild from 'esbuild';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

const context = await esbuild.context({
	entryPoints: ['src/extension.ts'],
	bundle: true,
	outfile: 'dist/extension.js',
	format: 'cjs',
	platform: 'node',
	// Matches the Electron runtime of the VS Code version this fork builds.
	target: 'node20',
	// Provided by the extension host at runtime and not resolvable at build time.
	external: ['vscode'],
	sourcemap: !production,
	minify: production,
	logLevel: 'info',
});

if (watch) {
	await context.watch();
} else {
	await context.rebuild();
	await context.dispose();
}
