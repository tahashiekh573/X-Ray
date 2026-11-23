#!/usr/bin/env node
/**
 * Runs Vitest from the canonical (realpath) working directory.
 *
 * On Windows a shell can report the drive as "f:\" while realpath() returns "F:\". Vitest
 * canonicalises its root, but Node loads the runner through the original casing, which yields two
 * Vitest instances ("Vitest failed to find the current suite"). Re-spawning from the canonical
 * cwd makes both agree. On other platforms this is a no-op passthrough.
 */
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { join } from 'node:path';

const cwd = realpathSync.native(process.cwd());
const bin = join(cwd, 'node_modules', 'vitest', 'vitest.mjs');
const result = spawnSync(process.execPath, [bin, ...process.argv.slice(2)], { cwd, stdio: 'inherit' });
process.exit(result.status ?? 1);
