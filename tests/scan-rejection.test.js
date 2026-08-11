/**
 * scan-rejection.test.js
 *
 * Tests the scanned-PDF pre-filter and rejection logic:
 *  - Text-based PDFs are NOT rejected
 *  - Image-only PDFs ARE rejected
 *  - The rejection produces the correct user-facing error message
 *  - No partial .md output is written for rejected PDFs
 *  - The manifest records status: "REJECTED_SCANNED_PDF"
 *  - Custom thresholds work correctly
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

async function importEsm(specifier) {
  return import(specifier);
}

describe('Scanned-PDF Rejection Logic', () => {
  let detectScannedPdf;
  let runJob;
  let createTextPdf;
  let createScannedPdf;
  let tmpDir;

  beforeAll(async () => {
    const scanDetector = await importEsm('../src/scan-detector.mjs');
    detectScannedPdf = scanDetector.detectScannedPdf;

    const jobRunner = await importEsm('../src/job-runner.mjs');
    runJob = jobRunner.runJob;

    const helpers = await importEsm('./helpers/create-test-pdfs.mjs');
    createTextPdf = helpers.createTextPdf;
    createScannedPdf = helpers.createScannedPdf;

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf2md-scan-test-'));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── detectScannedPdf unit tests ─────────────────────────────────────────────

  test('detectScannedPdf: text-based PDF is NOT classified as scanned', async () => {
    const buf = await createTextPdf(3);
    const result = await detectScannedPdf(buf);

    expect(result.isScanned).toBe(false);
    expect(result.totalPages).toBe(3);
    expect(result.avgCharsPerPage).toBeGreaterThan(20);
    expect(result.reason).toBeNull();
  });

  test('detectScannedPdf: image-only PDF IS classified as scanned', async () => {
    const buf = await createScannedPdf(2);
    const result = await detectScannedPdf(buf);

    expect(result.isScanned).toBe(true);
    expect(result.totalPages).toBe(2);
    expect(result.avgCharsPerPage).toBeLessThan(20);
    expect(result.reason).toBeTruthy();
  });

  test('detectScannedPdf: returns correct page counts', async () => {
    const buf = await createTextPdf(5);
    const result = await detectScannedPdf(buf);

    expect(result.totalPages).toBe(5);
  });

  test('detectScannedPdf: custom minCharsPerPage threshold works', async () => {
    // Text PDF with ~100+ chars/page — should pass default threshold
    const buf = await createTextPdf(2);

    // With a very high threshold, it should be classified as scanned
    const resultHigh = await detectScannedPdf(buf, { minCharsPerPage: 10000 });
    expect(resultHigh.isScanned).toBe(true);

    // With a very low threshold, it should NOT be classified as scanned
    const resultLow = await detectScannedPdf(buf, { minCharsPerPage: 1 });
    expect(resultLow.isScanned).toBe(false);
  });

  test('detectScannedPdf: custom maxEmptyPagePct threshold works', async () => {
    // Scanned PDF has 0 chars/page — triggers minCharsPerPage first
    // To test maxEmptyPagePct specifically, we need a PDF where some pages have
    // text and some don't. We use the scanned PDF with a very high minCharsPerPage
    // to bypass that check, and test emptyPagePct logic.
    const buf = await createScannedPdf(2);

    // With 0% empty page threshold, even 0% empty pages would pass
    // (but minCharsPerPage will still catch it unless we set it very low)
    const result = await detectScannedPdf(buf, {
      minCharsPerPage: 0,
      maxEmptyPagePct: 0, // reject if ANY pages are empty
    });
    // All pages are empty (0 chars), so emptyPagePct = 100% > 0% threshold
    expect(result.isScanned).toBe(true);
  });

  // ── runJob rejection tests ──────────────────────────────────────────────────

  test('runJob: rejects scanned PDF with REJECTED_SCANNED_PDF status', async () => {
    const buf = await createScannedPdf(2);
    const pdfPath = path.join(tmpDir, 'reject-test.pdf');
    fs.writeFileSync(pdfPath, buf);

    const result = await runJob(pdfPath, tmpDir);

    expect(result.status).toBe('REJECTED_SCANNED_PDF');
  });

  test('runJob: rejected PDF produces correct user-facing error message', async () => {
    const buf = await createScannedPdf(2);
    const pdfPath = path.join(tmpDir, 'reject-message-test.pdf');
    fs.writeFileSync(pdfPath, buf);

    const result = await runJob(pdfPath, tmpDir);

    expect(result.userMessage).toContain('appears to be a scanned/image-only PDF');
    expect(result.userMessage).toContain('no extractable text');
    expect(result.userMessage).toContain('This tool does not perform OCR');
    expect(result.userMessage).toContain('reject-message-test.pdf');
  });

  test('runJob: rejected PDF writes NO partial .md output file', async () => {
    const buf = await createScannedPdf(2);
    const pdfPath = path.join(tmpDir, 'reject-no-md-test.pdf');
    fs.writeFileSync(pdfPath, buf);

    const result = await runJob(pdfPath, tmpDir);

    expect(result.status).toBe('REJECTED_SCANNED_PDF');

    // The output directory should NOT contain a .md file
    const outputFiles = fs.readdirSync(result.outputDir);
    const mdFiles = outputFiles.filter(f => f.endsWith('.md'));
    expect(mdFiles).toHaveLength(0);
  });

  test('runJob: rejected PDF manifest records status REJECTED_SCANNED_PDF', async () => {
    const buf = await createScannedPdf(2);
    const pdfPath = path.join(tmpDir, 'reject-manifest-test.pdf');
    fs.writeFileSync(pdfPath, buf);

    const result = await runJob(pdfPath, tmpDir);

    expect(result.manifestPath).toBeDefined();
    const manifest = JSON.parse(fs.readFileSync(result.manifestPath, 'utf8'));
    expect(manifest.status).toBe('REJECTED_SCANNED_PDF');
    expect(manifest.rejectionReason).toBeTruthy();
  });

  test('runJob: text-based PDF is NOT rejected', async () => {
    const buf = await createTextPdf(2);
    const pdfPath = path.join(tmpDir, 'text-not-rejected.pdf');
    fs.writeFileSync(pdfPath, buf);

    const result = await runJob(pdfPath, tmpDir);

    expect(result.status).toBe('SUCCESS');
  });
});
