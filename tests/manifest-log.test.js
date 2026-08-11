/**
 * manifest-log.test.js
 *
 * Tests that manifest.json and conversion.log are generated correctly
 * with all required fields, and that the input archive is created properly.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

async function importEsm(specifier) {
  return import(specifier);
}

describe('Manifest and Log File Generation', () => {
  let runJob;
  let createTextPdf;
  let createScannedPdf;
  let tmpDir;

  beforeAll(async () => {
    const jobRunner = await importEsm('../src/job-runner.mjs');
    runJob = jobRunner.runJob;

    const helpers = await importEsm('./helpers/create-test-pdfs.mjs');
    createTextPdf = helpers.createTextPdf;
    createScannedPdf = helpers.createScannedPdf;

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf2md-manifest-test-'));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── Output folder structure ─────────────────────────────────────────────────

  test('Creates output folder with correct structure', async () => {
    const buf = await createTextPdf(2);
    const pdfPath = path.join(tmpDir, 'structure-test.pdf');
    fs.writeFileSync(pdfPath, buf);

    const result = await runJob(pdfPath, tmpDir);
    expect(result.status).toBe('SUCCESS');

    // Output dir should exist
    expect(fs.existsSync(result.outputDir)).toBe(true);

    // Should contain .md, manifest.json, conversion.log
    const files = fs.readdirSync(result.outputDir);
    expect(files).toContain('structure-test.md');
    expect(files).toContain('manifest.json');
    expect(files).toContain('conversion.log');
  });

  test('Output folder path follows YYYY-MM-DD/slug convention', async () => {
    const buf = await createTextPdf(1);
    const pdfPath = path.join(tmpDir, 'date-slug-test.pdf');
    fs.writeFileSync(pdfPath, buf);

    const result = await runJob(pdfPath, tmpDir);
    expect(result.status).toBe('SUCCESS');

    // Path should contain a date segment (YYYY-MM-DD)
    expect(result.outputDir).toMatch(/\d{4}-\d{2}-\d{2}/);
    // Path should contain a slug segment
    expect(result.outputDir).toContain('date-slug-test');
  });

  // ── manifest.json required fields ──────────────────────────────────────────

  test('manifest.json contains all required fields for SUCCESS', async () => {
    const buf = await createTextPdf(2);
    const pdfPath = path.join(tmpDir, 'manifest-fields-test.pdf');
    fs.writeFileSync(pdfPath, buf);

    const result = await runJob(pdfPath, tmpDir);
    expect(result.status).toBe('SUCCESS');

    const manifest = JSON.parse(fs.readFileSync(result.manifestPath, 'utf8'));

    // Required fields per spec
    expect(manifest.originalFilename).toBe('manifest-fields-test.pdf');
    expect(manifest.absoluteInputPath).toBeTruthy();
    expect(manifest.inputSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.outputSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.totalPages).toBe(2);
    expect(manifest.toolVersion).toBeTruthy();
    expect(manifest.pdf2mdVersion).toBe('0.2.2');
    expect(manifest.pdfjsDistVersion).toBeTruthy();
    expect(manifest.nodeVersion).toMatch(/^v\d+\./);
    expect(manifest.nodeArch).toBeTruthy();
    expect(manifest.conversionStartTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(manifest.conversionEndTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(manifest.hostname).toBeTruthy();
    expect(manifest.operator).toBeTruthy();
    expect(manifest.status).toBe('SUCCESS');
  });

  test('manifest.json absoluteInputPath is an absolute path', async () => {
    const buf = await createTextPdf(1);
    const pdfPath = path.join(tmpDir, 'abs-path-test.pdf');
    fs.writeFileSync(pdfPath, buf);

    const result = await runJob(pdfPath, tmpDir);
    const manifest = JSON.parse(fs.readFileSync(result.manifestPath, 'utf8'));

    expect(path.isAbsolute(manifest.absoluteInputPath)).toBe(true);
  });

  test('manifest.json timestamps are valid ISO 8601', async () => {
    const buf = await createTextPdf(1);
    const pdfPath = path.join(tmpDir, 'timestamp-test.pdf');
    fs.writeFileSync(pdfPath, buf);

    const result = await runJob(pdfPath, tmpDir);
    const manifest = JSON.parse(fs.readFileSync(result.manifestPath, 'utf8'));

    const startDate = new Date(manifest.conversionStartTime);
    const endDate = new Date(manifest.conversionEndTime);

    expect(startDate.getTime()).not.toBeNaN();
    expect(endDate.getTime()).not.toBeNaN();
    expect(endDate.getTime()).toBeGreaterThanOrEqual(startDate.getTime());
  });

  test('manifest.json for rejected PDF contains all required fields', async () => {
    const buf = await createScannedPdf(2);
    const pdfPath = path.join(tmpDir, 'rejected-manifest-fields.pdf');
    fs.writeFileSync(pdfPath, buf);

    const result = await runJob(pdfPath, tmpDir);
    expect(result.status).toBe('REJECTED_SCANNED_PDF');

    const manifest = JSON.parse(fs.readFileSync(result.manifestPath, 'utf8'));

    expect(manifest.status).toBe('REJECTED_SCANNED_PDF');
    expect(manifest.rejectionReason).toBeTruthy();
    expect(manifest.originalFilename).toBe('rejected-manifest-fields.pdf');
    expect(manifest.inputSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.totalPages).toBe(2);
    expect(manifest.toolVersion).toBeTruthy();
    expect(manifest.nodeVersion).toMatch(/^v\d+\./);
    expect(manifest.conversionStartTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  // ── conversion.log ─────────────────────────────────────────────────────────

  test('conversion.log is created and non-empty', async () => {
    const buf = await createTextPdf(1);
    const pdfPath = path.join(tmpDir, 'log-test.pdf');
    fs.writeFileSync(pdfPath, buf);

    const result = await runJob(pdfPath, tmpDir);

    expect(fs.existsSync(result.logPath)).toBe(true);
    const logContent = fs.readFileSync(result.logPath, 'utf8');
    expect(logContent.length).toBeGreaterThan(0);
  });

  test('conversion.log contains key processing step entries', async () => {
    const buf = await createTextPdf(2);
    const pdfPath = path.join(tmpDir, 'log-content-test.pdf');
    fs.writeFileSync(pdfPath, buf);

    const result = await runJob(pdfPath, tmpDir);

    const logContent = fs.readFileSync(result.logPath, 'utf8');
    // Log should mention key steps
    expect(logContent).toContain('Job started');
    expect(logContent).toContain('checksum');
  });

  test('conversion.log for rejected PDF contains REJECTED_SCANNED_PDF entry', async () => {
    const buf = await createScannedPdf(2);
    const pdfPath = path.join(tmpDir, 'log-rejected-test.pdf');
    fs.writeFileSync(pdfPath, buf);

    const result = await runJob(pdfPath, tmpDir);

    const logContent = fs.readFileSync(result.logPath, 'utf8');
    expect(logContent).toContain('REJECTED_SCANNED_PDF');
  });

  // ── Input archive ───────────────────────────────────────────────────────────

  test('Input file is copied to input-archive folder', async () => {
    const buf = await createTextPdf(1);
    const pdfPath = path.join(tmpDir, 'archive-test.pdf');
    fs.writeFileSync(pdfPath, buf);

    const result = await runJob(pdfPath, tmpDir);
    expect(result.status).toBe('SUCCESS');

    // Find the archived copy
    const archiveRoot = path.join(tmpDir, 'input-archive');
    expect(fs.existsSync(archiveRoot)).toBe(true);

    let foundArchive = false;
    function findFile(dir, name) {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) findFile(full, name);
        else if (entry.name === name) foundArchive = true;
      }
    }
    findFile(archiveRoot, 'archive-test.pdf');
    expect(foundArchive).toBe(true);
  });

  test('Original input file is NOT modified (content unchanged after job)', async () => {
    const buf = await createTextPdf(1);
    const pdfPath = path.join(tmpDir, 'no-modify-test.pdf');
    fs.writeFileSync(pdfPath, buf);

    const originalContent = fs.readFileSync(pdfPath);
    await runJob(pdfPath, tmpDir);
    const afterContent = fs.readFileSync(pdfPath);

    expect(Buffer.compare(originalContent, afterContent)).toBe(0);
  });
});
