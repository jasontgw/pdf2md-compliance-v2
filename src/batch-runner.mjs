/**
 * batch-runner.mjs
 *
 * Discovers PDF files from the --input path (file or folder, optionally recursive)
 * and runs a conversion job for each one sequentially.
 *
 * Per the spec: "Exit with a non-zero exit code for scripting/automation use,
 * but continue processing remaining files in a batch job."
 * → Errors on individual files do NOT abort the batch.
 */

import fs from 'fs';
import path from 'path';
import { runJob } from './job-runner.mjs';

/**
 * Collect all PDF file paths under a given root.
 *
 * @param {string} inputPath
 * @param {boolean} recursive
 * @returns {string[]}
 */
function collectPdfFiles(inputPath, recursive) {
  const resolved = path.resolve(inputPath);
  const stat = fs.statSync(resolved);

  if (stat.isFile()) {
    if (!resolved.toLowerCase().endsWith('.pdf')) {
      throw new Error(`Input file "${resolved}" does not appear to be a PDF (no .pdf extension).`);
    }
    return [resolved];
  }

  if (!stat.isDirectory()) {
    throw new Error(`Input path "${resolved}" is neither a file nor a directory.`);
  }

  const results = [];

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && recursive) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
        results.push(fullPath);
      }
    }
  }

  walk(resolved);

  if (results.length === 0) {
    throw new Error(`No PDF files found in "${resolved}"${recursive ? ' (recursive)' : ''}.`);
  }

  return results;
}

/**
 * Run conversion jobs for all discovered PDF files.
 *
 * @param {object} opts
 * @param {string} opts.inputPath
 * @param {string} opts.outputBaseDir
 * @param {boolean} [opts.recursive=false]
 * @param {number} [opts.minCharsPerPage=20]
 * @param {number} [opts.maxEmptyPagePct=80]
 * @param {boolean} [opts.verbose=false]
 * @returns {Promise<BatchResult>}
 */
export async function runBatch(opts) {
  const {
    inputPath,
    outputBaseDir,
    recursive = false,
    minCharsPerPage = 20,
    maxEmptyPagePct = 80,
    verbose = false,
  } = opts;

  let pdfFiles;
  try {
    pdfFiles = collectPdfFiles(inputPath, recursive);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
    return { jobs: [], error: err.message };
  }

  console.log(`\npdf2md-compliance: Found ${pdfFiles.length} PDF file(s) to process.\n`);

  const jobs = [];

  for (const filePath of pdfFiles) {
    console.log(`Processing: ${filePath}`);
    const result = await runJob(filePath, outputBaseDir, {
      minCharsPerPage,
      maxEmptyPagePct,
      verbose,
    });

    jobs.push(result);

    if (result.status === 'SUCCESS') {
      console.log(`  ✓ SUCCESS  → ${result.mdPath}`);
      console.log(`    Manifest → ${result.manifestPath}`);
      console.log(`    Log      → ${result.logPath}`);
    } else if (result.status === 'REJECTED_SCANNED_PDF') {
      console.error(`  ✗ REJECTED → ${result.userMessage}`);
      console.log(`    Manifest → ${result.manifestPath}`);
      console.log(`    Log      → ${result.logPath}`);
    } else {
      console.error(`  ✗ ERROR    → ${result.error}`);
    }
    console.log('');
  }

  // Summary
  const success = jobs.filter(j => j.status === 'SUCCESS').length;
  const rejected = jobs.filter(j => j.status === 'REJECTED_SCANNED_PDF').length;
  const errors = jobs.filter(j => j.status === 'ERROR').length;

  console.log('─'.repeat(60));
  console.log(`Summary: ${success} succeeded, ${rejected} rejected (scanned), ${errors} errored`);
  console.log('─'.repeat(60));

  return { jobs, success, rejected, errors };
}
