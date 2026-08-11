/**
 * job-runner.mjs
 *
 * Orchestrates a single PDF → Markdown conversion job:
 *
 *  1. Initialise compliance context (dirs, logger)
 *  2. Read & checksum the input PDF
 *  3. Archive the input file
 *  4. Run the scanned-PDF pre-filter
 *  5. If scanned → reject with manifest + log entry, non-zero exit signal
 *  6. If text-based → convert page-by-page, write .md, checksum output
 *  7. Write final manifest.json
 *
 * Returns a JobResult:
 *   { status: 'SUCCESS'|'REJECTED_SCANNED_PDF'|'ERROR', ... }
 */

import fs from 'fs';
import { initJobContext, archiveInputFile, writeManifest, computeSha256 } from './compliance.mjs';
import { detectScannedPdf } from './scan-detector.mjs';
import { convertPdfToMarkdown } from './converter.mjs';

/**
 * @param {string} inputFilePath
 * @param {string} outputBaseDir
 * @param {object} [options]
 * @param {number} [options.minCharsPerPage=20]
 * @param {number} [options.maxEmptyPagePct=80]
 * @param {boolean} [options.verbose=false]
 * @returns {Promise<JobResult>}
 */
export async function runJob(inputFilePath, outputBaseDir, options = {}) {
  const {
    minCharsPerPage = 20,
    maxEmptyPagePct = 80,
    verbose = false,
  } = options;

  // ── 1. Init context ─────────────────────────────────────────────────────────
  const ctx = initJobContext(inputFilePath, outputBaseDir, verbose);
  const { logger } = ctx;

  logger.info({ file: ctx.inputFilePath }, 'Job started: file received');

  try {
    // ── 2. Read & checksum input ───────────────────────────────────────────────
    const pdfBuffer = fs.readFileSync(ctx.inputFilePath);
    const inputSha256 = computeSha256(pdfBuffer);
    logger.info({ sha256: inputSha256 }, 'Input checksum computed (SHA-256)');

    // ── 3. Archive input ───────────────────────────────────────────────────────
    archiveInputFile(ctx, inputSha256);
    logger.info({ archiveDir: ctx.archiveDir }, 'Input file archived');

    // ── 4. Scanned-PDF pre-filter ──────────────────────────────────────────────
    logger.info('Running scanned-PDF pre-filter...');
    const scanResult = await detectScannedPdf(pdfBuffer, { minCharsPerPage, maxEmptyPagePct });

    logger.info(
      {
        totalPages: scanResult.totalPages,
        avgCharsPerPage: scanResult.avgCharsPerPage.toFixed(1),
        emptyPagePct: scanResult.emptyPagePct.toFixed(1),
        isScanned: scanResult.isScanned,
      },
      'Scanned-PDF check complete'
    );

    // ── 5. Reject scanned PDFs ─────────────────────────────────────────────────
    if (scanResult.isScanned) {
      const endTime = new Date().toISOString();
      logger.error(
        { reason: scanResult.reason },
        `REJECTED_SCANNED_PDF: ${ctx.filename}`
      );

      writeManifest(ctx, {
        status: 'REJECTED_SCANNED_PDF',
        rejectionReason: scanResult.reason,
        inputSha256,
        totalPages: scanResult.totalPages,
        emptyPages: scanResult.emptyPages,
        avgCharsPerPage: scanResult.avgCharsPerPage,
        emptyPagePct: scanResult.emptyPagePct,
        endTime,
      });

      const userMessage =
        `Error: '${ctx.filename}' appears to be a scanned/image-only PDF with no extractable text. ` +
        `This tool does not perform OCR. Please provide a text-based PDF or use an OCR tool first.`;

      return {
        status: 'REJECTED_SCANNED_PDF',
        filename: ctx.filename,
        outputDir: ctx.outputDir,
        manifestPath: ctx.manifestPath,
        logPath: ctx.logPath,
        userMessage,
        scanResult,
      };
    }

    // ── 6. Convert page-by-page ────────────────────────────────────────────────
    logger.info('Starting page-by-page PDF → Markdown conversion...');

    const { markdown, totalPages } = await convertPdfToMarkdown(pdfBuffer, {
      onPageConverted: (pageNum, total) => {
        logger.debug({ pageNum, total }, `Page ${pageNum}/${total} converted`);
      },
    });

    logger.info({ totalPages }, 'All pages converted');

    // Write .md output
    fs.writeFileSync(ctx.mdPath, markdown, 'utf8');
    logger.info({ mdPath: ctx.mdPath }, 'Markdown output written');

    // Checksum the output
    const outputSha256 = computeSha256(Buffer.from(markdown, 'utf8'));
    logger.info({ sha256: outputSha256 }, 'Output checksum computed (SHA-256)');

    // ── 7. Write manifest ──────────────────────────────────────────────────────
    const endTime = new Date().toISOString();
    writeManifest(ctx, {
      status: 'SUCCESS',
      inputSha256,
      outputSha256,
      totalPages,
      mdPath: ctx.mdPath,
      endTime,
    });

    logger.info({ outputDir: ctx.outputDir }, 'Job completed successfully');

    return {
      status: 'SUCCESS',
      filename: ctx.filename,
      outputDir: ctx.outputDir,
      mdPath: ctx.mdPath,
      manifestPath: ctx.manifestPath,
      logPath: ctx.logPath,
      totalPages,
      inputSha256,
      outputSha256,
    };
  } catch (err) {
    const endTime = new Date().toISOString();
    logger.error({ err: err.message, stack: err.stack }, 'Job failed with error');

    try {
      writeManifest(ctx, {
        status: 'ERROR',
        error: err.message,
        endTime,
      });
    } catch (_) { /* best-effort */ }

    return {
      status: 'ERROR',
      filename: ctx.filename,
      outputDir: ctx.outputDir,
      manifestPath: ctx.manifestPath,
      logPath: ctx.logPath,
      error: err.message,
    };
  }
}
