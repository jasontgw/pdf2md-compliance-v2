/**
 * compliance.mjs
 *
 * Handles all compliance-grade bookkeeping for each conversion job:
 *
 *  - Output folder structure:
 *      /output/{YYYY-MM-DD}/{slug}/
 *        ├── {filename}.md
 *        ├── manifest.json
 *        └── conversion.log
 *
 *  - Input archive:
 *      /input-archive/{YYYY-MM-DD}/{slug}/
 *        ├── {filename}.pdf          (copy of original)
 *        └── {filename}.pdf.sha256   (checksum sidecar)
 *
 *  - manifest.json fields (see MANIFEST_FIELDS below)
 *  - Structured logging via pino (console + file)
 *  - SHA-256 checksums via Node's built-in crypto module
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pino = require('pino');
const pinoPretty = require('pino-pretty');

// ─── Version constants ────────────────────────────────────────────────────────

const TOOL_VERSION = '1.0.0';

function getPackageVersion(pkgName) {
  try {
    return require(`${pkgName}/package.json`).version;
  } catch {
    return 'unknown';
  }
}

// ─── Checksum helpers ─────────────────────────────────────────────────────────

/**
 * Compute SHA-256 checksum of a Buffer or file path.
 * @param {Buffer|string} input - Buffer or absolute file path
 * @returns {string} hex digest
 */
export function computeSha256(input) {
  const data = typeof input === 'string' ? fs.readFileSync(input) : input;
  return crypto.createHash('sha256').update(data).digest('hex');
}

// ─── Slug helper ──────────────────────────────────────────────────────────────

/**
 * Convert a filename (without extension) to a filesystem-safe slug.
 * Falls back to a simple replace if slugify is unavailable.
 */
function slugify(name) {
  try {
    const slugifyFn = require('slugify');
    return slugifyFn(name, { lower: true, strict: true });
  } catch {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
}

// ─── Date helper ──────────────────────────────────────────────────────────────

function todayIso() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

// ─── Logger factory ───────────────────────────────────────────────────────────

/**
 * Create a pino logger that writes to both the console (pretty) and a log file.
 *
 * Uses sync mode for both streams to ensure all log entries are flushed
 * immediately — important for test environments and compliance audit trails
 * where the log file must be fully written before the process exits.
 *
 * @param {string} logFilePath - Absolute path to conversion.log
 * @param {boolean} verbose    - Whether to enable debug-level output
 * @returns {pino.Logger}
 */
export function createLogger(logFilePath, verbose = false) {
  const level = verbose ? 'debug' : 'info';

  // Pretty stream for console (sync to avoid buffering issues)
  const prettyStream = pinoPretty({
    colorize: true,
    translateTime: 'SYS:standard',
    ignore: 'pid,hostname',
    sync: true,
    destination: 1, // stdout file descriptor
  });

  // Raw JSON stream for log file (sync for immediate flush and audit reliability)
  const fileStream = pino.destination({ dest: logFilePath, sync: true });

  // Multi-stream: console (pretty) + file (JSON)
  const streams = [
    { stream: prettyStream, level },
    { stream: fileStream, level },
  ];

  return pino({ level }, pino.multistream(streams));
}

// ─── Job context ─────────────────────────────────────────────────────────────

/**
 * Initialise the output and archive directories for a single conversion job.
 *
 * @param {string} inputFilePath  - Absolute path to the source PDF
 * @param {string} outputBaseDir  - Root output directory (--output flag)
 * @param {boolean} verbose
 * @returns {JobContext}
 */
export function initJobContext(inputFilePath, outputBaseDir, verbose = false) {
  const filename = path.basename(inputFilePath);
  const filenameNoExt = path.basename(inputFilePath, path.extname(inputFilePath));
  const slug = slugify(filenameNoExt) || 'document';
  const dateStr = todayIso();

  // Output folder
  const outputDir = path.join(outputBaseDir, 'output', dateStr, slug);
  fs.mkdirSync(outputDir, { recursive: true });

  // Archive folder
  const archiveDir = path.join(outputBaseDir, 'input-archive', dateStr, slug);
  fs.mkdirSync(archiveDir, { recursive: true });

  const mdPath = path.join(outputDir, `${filenameNoExt}.md`);
  const manifestPath = path.join(outputDir, 'manifest.json');
  const logPath = path.join(outputDir, 'conversion.log');

  const logger = createLogger(logPath, verbose);

  return {
    inputFilePath: path.resolve(inputFilePath),
    filename,
    filenameNoExt,
    slug,
    dateStr,
    outputDir,
    archiveDir,
    mdPath,
    manifestPath,
    logPath,
    logger,
    startTime: new Date().toISOString(),
  };
}

// ─── Archive helper ───────────────────────────────────────────────────────────

/**
 * Copy the original PDF into the input-archive folder and write a .sha256 sidecar.
 * Never modifies the original file.
 *
 * @param {JobContext} ctx
 * @param {string} inputSha256
 */
export function archiveInputFile(ctx, inputSha256) {
  const archivePdfPath = path.join(ctx.archiveDir, ctx.filename);
  const archiveChecksumPath = path.join(ctx.archiveDir, `${ctx.filename}.sha256`);

  fs.copyFileSync(ctx.inputFilePath, archivePdfPath);
  fs.writeFileSync(archiveChecksumPath, `${inputSha256}  ${ctx.filename}\n`, 'utf8');

  ctx.logger.debug({ archivePdfPath, archiveChecksumPath }, 'Input file archived');
}

// ─── Manifest writer ─────────────────────────────────────────────────────────

/**
 * Write manifest.json for a completed (or rejected) conversion job.
 *
 * @param {JobContext} ctx
 * @param {object} data
 */
export function writeManifest(ctx, data) {
  const manifest = {
    toolVersion: TOOL_VERSION,
    pdf2mdVersion: getPackageVersion('@opendocsg/pdf2md'),
    pdfjsDistVersion: getPackageVersion('pdfjs-dist'),
    nodeVersion: process.version,
    nodeArch: process.arch,
    hostname: os.hostname(),
    operator: os.userInfo().username,

    originalFilename: ctx.filename,
    absoluteInputPath: ctx.inputFilePath,

    conversionStartTime: ctx.startTime,
    conversionEndTime: data.endTime || new Date().toISOString(),

    ...data,
  };

  fs.writeFileSync(ctx.manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  ctx.logger.debug({ manifestPath: ctx.manifestPath }, 'Manifest written');
}
