/**
 * checksum.test.js
 *
 * Tests that SHA-256 checksums are computed correctly and consistently,
 * and that the manifest records the correct checksums for both input and output.
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function importEsm(specifier) {
  return import(specifier);
}

describe('Checksum Accuracy', () => {
  let computeSha256;
  let createTextPdf;
  let runJob;
  let tmpDir;

  beforeAll(async () => {
    const compliance = await importEsm('../src/compliance.mjs');
    computeSha256 = compliance.computeSha256;

    const helpers = await importEsm('./helpers/create-test-pdfs.mjs');
    createTextPdf = helpers.createTextPdf;

    const jobRunner = await importEsm('../src/job-runner.mjs');
    runJob = jobRunner.runJob;

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf2md-test-'));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('computeSha256 returns a 64-character hex string', () => {
    const buf = Buffer.from('hello world');
    const hash = computeSha256(buf);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test('computeSha256 matches Node crypto reference implementation', () => {
    const buf = Buffer.from('pdf2md-compliance test data 12345');
    const expected = crypto.createHash('sha256').update(buf).digest('hex');
    expect(computeSha256(buf)).toBe(expected);
  });

  test('computeSha256 is deterministic for the same input', () => {
    const buf = Buffer.from('deterministic test');
    expect(computeSha256(buf)).toBe(computeSha256(buf));
  });

  test('computeSha256 differs for different inputs', () => {
    const buf1 = Buffer.from('input one');
    const buf2 = Buffer.from('input two');
    expect(computeSha256(buf1)).not.toBe(computeSha256(buf2));
  });

  test('computeSha256 accepts a file path', () => {
    const filePath = path.join(tmpDir, 'test-file.txt');
    const content = 'file checksum test content';
    fs.writeFileSync(filePath, content);

    const expected = crypto.createHash('sha256').update(content).digest('hex');
    expect(computeSha256(filePath)).toBe(expected);
  });

  test('manifest.json records correct input and output SHA-256 checksums', async () => {
    const pdfBuf = await createTextPdf(2);
    const pdfPath = path.join(tmpDir, 'checksum-test.pdf');
    fs.writeFileSync(pdfPath, pdfBuf);

    const result = await runJob(pdfPath, tmpDir);
    expect(result.status).toBe('SUCCESS');

    const manifest = JSON.parse(fs.readFileSync(result.manifestPath, 'utf8'));

    // Verify input checksum
    const expectedInputHash = crypto.createHash('sha256').update(pdfBuf).digest('hex');
    expect(manifest.inputSha256).toBe(expectedInputHash);

    // Verify output checksum
    const mdContent = fs.readFileSync(result.mdPath);
    const expectedOutputHash = crypto.createHash('sha256').update(mdContent).digest('hex');
    expect(manifest.outputSha256).toBe(expectedOutputHash);
  });

  test('archive .sha256 sidecar file contains correct checksum', async () => {
    const pdfBuf = await createTextPdf(1);
    const pdfPath = path.join(tmpDir, 'archive-checksum-test.pdf');
    fs.writeFileSync(pdfPath, pdfBuf);

    const result = await runJob(pdfPath, tmpDir);
    expect(result.status).toBe('SUCCESS');

    // Find the archive checksum sidecar
    const archiveDir = path.join(tmpDir, 'input-archive');
    const sha256Files = [];
    function findSha256(dir) {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) findSha256(full);
        else if (entry.name.endsWith('.sha256')) sha256Files.push(full);
      }
    }
    findSha256(archiveDir);

    const relevantSidecar = sha256Files.find(f => f.includes('archive-checksum-test'));
    expect(relevantSidecar).toBeDefined();

    const sidecarContent = fs.readFileSync(relevantSidecar, 'utf8');
    const expectedHash = crypto.createHash('sha256').update(pdfBuf).digest('hex');
    expect(sidecarContent).toContain(expectedHash);
  });
});
