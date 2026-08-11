/**
 * gui/server.mjs
 *
 * Local-only Express server for the pdf2md-compliance-v2 GUI.
 *
 * Endpoints:
 *   POST /api/convert   — Upload one or more PDFs, compute SHA-256 checksums,
 *                         run conversion, return results as JSON (streamed via SSE).
 *   GET  /api/download  — Download a converted .md file by path.
 *   GET  /              — Serve the frontend (public/index.html).
 */

import express from 'express';
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

// ── Path helpers ──────────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');          // pdf2md-compliance-v2/
const PUBLIC = path.join(__dirname, 'public');

// ── Import core library modules ───────────────────────────────────────────────
// We import the same modules the CLI uses so behaviour is identical.
const { runJob } = await import(`${ROOT}/src/job-runner.mjs`);

// ── Express setup ─────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(express.static(PUBLIC));

// ── Multer: accept PDF uploads into a temp dir ────────────────────────────────
const upload = multer({
  dest: os.tmpdir(),
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are accepted.'));
    }
  },
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB per file
});

// ── Helper: compute SHA-256 of a file ────────────────────────────────────────
function sha256File(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

// ── POST /api/convert ─────────────────────────────────────────────────────────
// Accepts multipart/form-data with:
//   files[]     — one or more PDF files
//   outputDir   — absolute path on the local machine for output (optional;
//                 defaults to ~/pdf2md-output)
//
// Returns Server-Sent Events (SSE) so the browser can stream progress.
app.post('/api/convert', upload.array('files'), async (req, res) => {
  const files = req.files;
  if (!files || files.length === 0) {
    return res.status(400).json({ error: 'No PDF files uploaded.' });
  }

  const outputBaseDir = (req.body.outputDir && req.body.outputDir.trim())
    ? req.body.outputDir.trim()
    : path.join(os.homedir(), 'pdf2md-output');

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  send({ type: 'start', total: files.length });

  const results = [];

  for (let i = 0; i < files.length; i++) {
    const uploadedFile = files[i];
    const originalName = uploadedFile.originalname;

    // Rename temp file to have .pdf extension so job-runner recognises it
    const renamedPath = path.join(os.tmpdir(), `pdf2md-gui-${Date.now()}-${originalName}`);
    fs.renameSync(uploadedFile.path, renamedPath);

    send({ type: 'progress', index: i + 1, total: files.length, filename: originalName, stage: 'checksum' });

    // Compute SHA-256 of the input before conversion
    const inputSha256 = sha256File(renamedPath);

    send({ type: 'progress', index: i + 1, total: files.length, filename: originalName, stage: 'converting', inputSha256 });

    let jobResult;
    try {
      jobResult = await runJob(renamedPath, outputBaseDir, {
        minCharsPerPage: 20,
        maxEmptyPagePct: 80,
        verbose: false,
      });
    } catch (err) {
      jobResult = { status: 'ERROR', filename: originalName, error: err.message };
    } finally {
      // Clean up temp file
      try { fs.unlinkSync(renamedPath); } catch (_) {}
    }

    const result = {
      filename: originalName,
      status: jobResult.status,
      inputSha256,
      outputSha256: jobResult.outputSha256 || null,
      mdPath: jobResult.mdPath || null,
      manifestPath: jobResult.manifestPath || null,
      totalPages: jobResult.totalPages || null,
      error: jobResult.error || jobResult.userMessage || null,
    };

    results.push(result);
    send({ type: 'result', index: i + 1, total: files.length, result });
  }

  send({ type: 'done', results });
  res.end();
});

// ── GET /api/download ─────────────────────────────────────────────────────────
// Query param: ?path=<absolute path to .md file>
// Only serves files that end in .md and exist on disk.
app.get('/api/download', (req, res) => {
  const filePath = req.query.path;
  if (!filePath || !filePath.endsWith('.md') || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found.' });
  }
  res.download(filePath);
});

// ── GET /api/read ─────────────────────────────────────────────────────────────
// Returns the text content of a .md file for in-browser preview.
app.get('/api/read', (req, res) => {
  const filePath = req.query.path;
  if (!filePath || !filePath.endsWith('.md') || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found.' });
  }
  const content = fs.readFileSync(filePath, 'utf8');
  res.json({ content });
});

// ── Start server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\npdf2md-compliance GUI running at ${url}`);
  console.log('Press Ctrl+C to stop.\n');

  // Auto-open browser (macOS)
  try {
    execSync(`open "${url}"`);
  } catch (_) {
    // Non-macOS or open not available — user can navigate manually
  }
});
