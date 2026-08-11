#!/usr/bin/env node
/**
 * check-version-ranges.js
 *
 * CI / pre-commit guard: fails the build if package.json contains any
 * "^" or "~" version range prefixes for the pinned critical packages:
 *   - @opendocsg/pdf2md
 *   - pdfjs-dist
 *
 * Usage:  node scripts/check-version-ranges.js
 * Exit 0 = all clear; Exit 1 = range prefix detected.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const pkgPath = path.resolve(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

const PINNED_PACKAGES = ['@opendocsg/pdf2md', 'pdfjs-dist'];
const RANGE_PREFIXES = ['^', '~'];

let failed = false;

const allDeps = {
  ...pkg.dependencies,
  ...pkg.devDependencies,
  ...pkg.peerDependencies,
};

for (const pkgName of PINNED_PACKAGES) {
  const version = allDeps[pkgName];
  if (!version) {
    console.warn(`[check-version-ranges] WARNING: "${pkgName}" not found in package.json dependencies.`);
    continue;
  }
  for (const prefix of RANGE_PREFIXES) {
    if (version.startsWith(prefix)) {
      console.error(
        `[check-version-ranges] FAIL: "${pkgName}" uses a range prefix "${prefix}" (value: "${version}"). ` +
        `Pin to an exact version without "^" or "~".`
      );
      failed = true;
    }
  }
}

if (failed) {
  process.exit(1);
} else {
  console.log('[check-version-ranges] OK: All pinned packages use exact version strings.');
  process.exit(0);
}
