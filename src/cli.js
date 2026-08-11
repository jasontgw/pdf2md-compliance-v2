#!/usr/bin/env node
/**
 * cli.js
 *
 * Entry point for the pdf2md-compliance CLI tool.
 *
 * Usage:
 *   pdf2md-compliance --input <folder or file> --output <folder>
 *                     [--recursive] [--scan-threshold <chars>]
 *                     [--scan-empty-pct <pct>] [--verbose]
 *
 * All processing is local-only. No network calls are made.
 */

'use strict';

// We use a dynamic import to load the ESM modules from this CommonJS entry point.
// This is the standard pattern for Node.js CLI tools that mix CJS (shebang) with ESM.
async function main() {
  const { program } = await import('commander');
  const { runBatch } = await import('./batch-runner.mjs');

  program
    .name('pdf2md-compliance')
    .description(
      'Local-only, offline CLI tool to convert PDF files to Markdown with compliance-grade ' +
      'extensions (page markers, SHA-256 checksums, manifests, scanned-PDF rejection). ' +
      'No files are ever uploaded to any external server or API.'
    )
    .version('1.0.0')
    .requiredOption('-i, --input <path>', 'Input PDF file or folder containing PDF files')
    .requiredOption('-o, --output <path>', 'Root output folder for results')
    .option('-r, --recursive', 'Recursively scan subfolders for PDF files', false)
    .option(
      '--scan-threshold <chars>',
      'Minimum average characters per page to consider a PDF text-based (default: 20)',
      (v) => {
        const n = parseInt(v, 10);
        if (isNaN(n) || n < 0) throw new Error('--scan-threshold must be a non-negative integer');
        return n;
      },
      20
    )
    .option(
      '--scan-empty-pct <pct>',
      'Maximum percentage of empty pages before a PDF is rejected as scanned (default: 80)',
      (v) => {
        const n = parseFloat(v);
        if (isNaN(n) || n < 0 || n > 100) throw new Error('--scan-empty-pct must be between 0 and 100');
        return n;
      },
      80
    )
    .option('-v, --verbose', 'Enable verbose/debug logging', false);

  program.parse(process.argv);
  const opts = program.opts();

  const result = await runBatch({
    inputPath: opts.input,
    outputBaseDir: opts.output,
    recursive: opts.recursive,
    minCharsPerPage: opts.scanThreshold,
    maxEmptyPagePct: opts.scanEmptyPct,
    verbose: opts.verbose,
  });

  // Exit with non-zero if any file had an error or rejection
  const hasFailures = result.jobs.some(
    j => j.status === 'ERROR' || j.status === 'REJECTED_SCANNED_PDF'
  );

  if (hasFailures) {
    process.exitCode = 1;
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
