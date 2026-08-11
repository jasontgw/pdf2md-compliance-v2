/**
 * index.mjs
 *
 * Public programmatic API for pdf2md-compliance.
 * Consumers can import these functions to integrate the tool into their own pipelines.
 */

export { runJob } from './job-runner.mjs';
export { runBatch } from './batch-runner.mjs';
export { detectScannedPdf } from './scan-detector.mjs';
export { convertPdfToMarkdown } from './converter.mjs';
export { computeSha256 } from './compliance.mjs';
