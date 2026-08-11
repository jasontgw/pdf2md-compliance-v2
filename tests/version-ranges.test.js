/**
 * version-ranges.test.js
 *
 * Tests the CI/pre-commit version range check script.
 * Verifies that the script correctly detects ^ and ~ prefixes on pinned packages.
 */

'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SCRIPT_PATH = path.resolve(__dirname, '../scripts/check-version-ranges.js');
const PKG_PATH = path.resolve(__dirname, '../package.json');

describe('Version Range Check Script', () => {
  test('Script passes on the real package.json (no range prefixes on pinned packages)', () => {
    const result = execSync(`node "${SCRIPT_PATH}"`, {
      encoding: 'utf8',
      env: { ...process.env },
    });
    expect(result).toContain('OK');
  });

  test('Script fails when @opendocsg/pdf2md uses ^ prefix', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf2md-ver-test-'));
    const tmpPkg = path.join(tmpDir, 'package.json');
    const tmpScript = path.join(tmpDir, 'check-version-ranges.js');

    // Copy the script but point it to our temp package.json
    const scriptContent = fs.readFileSync(SCRIPT_PATH, 'utf8').replace(
      "path.resolve(__dirname, '..', 'package.json')",
      `"${tmpPkg.replace(/\\/g, '\\\\')}"`
    );
    fs.writeFileSync(tmpScript, scriptContent);

    const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
    pkg.dependencies['@opendocsg/pdf2md'] = '^0.2.2'; // introduce range prefix
    fs.writeFileSync(tmpPkg, JSON.stringify(pkg, null, 2));

    try {
      execSync(`node "${tmpScript}"`, { encoding: 'utf8' });
      fail('Expected script to throw');
    } catch (err) {
      expect(err.status).toBe(1);
      expect(err.stderr || err.stdout).toContain('FAIL');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('Script fails when pdfjs-dist uses ~ prefix', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf2md-ver-test2-'));
    const tmpPkg = path.join(tmpDir, 'package.json');
    const tmpScript = path.join(tmpDir, 'check-version-ranges.js');

    const scriptContent = fs.readFileSync(SCRIPT_PATH, 'utf8').replace(
      "path.resolve(__dirname, '..', 'package.json')",
      `"${tmpPkg.replace(/\\/g, '\\\\')}"`
    );
    fs.writeFileSync(tmpScript, scriptContent);

    const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
    pkg.dependencies['pdfjs-dist'] = '~4.4.168'; // introduce tilde prefix
    fs.writeFileSync(tmpPkg, JSON.stringify(pkg, null, 2));

    try {
      execSync(`node "${tmpScript}"`, { encoding: 'utf8' });
      fail('Expected script to throw');
    } catch (err) {
      expect(err.status).toBe(1);
      expect(err.stderr || err.stdout).toContain('FAIL');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('package.json has exact version for @opendocsg/pdf2md (no ^ or ~)', () => {
    const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
    const version = pkg.dependencies['@opendocsg/pdf2md'];
    expect(version).toBeDefined();
    expect(version).not.toMatch(/^[\^~]/);
    expect(version).toBe('0.2.2');
  });

  test('package.json has exact version for pdfjs-dist (no ^ or ~)', () => {
    const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
    const version = pkg.dependencies['pdfjs-dist'];
    expect(version).toBeDefined();
    expect(version).not.toMatch(/^[\^~]/);
  });
});
