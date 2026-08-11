/**
 * generate-sample-pdfs.mjs
 *
 * Generates two sample PDFs for testing:
 *
 *  1. sample-text.pdf      — A 3-page text-based PDF with real extractable text
 *  2. sample-scanned.pdf   — A 2-page "scanned" PDF (image-only, no extractable text)
 *
 * Uses pdf-lib (devDependency) for pure-JS PDF creation — no canvas, no browser.
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'sample-pdfs');
fs.mkdirSync(outDir, { recursive: true });

// ─── 1. Text-based PDF (3 pages) ─────────────────────────────────────────────

async function createTextPdf() {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pages = [
    {
      title: 'Chapter 1: Introduction',
      body: [
        'This is a sample text-based PDF document created for testing the',
        'pdf2md-compliance tool. This page contains real extractable text.',
        '',
        'The tool converts PDF files to Markdown while maintaining compliance',
        'records including SHA-256 checksums, manifests, and conversion logs.',
        '',
        'Key features:',
        '  - Page-by-page conversion with page markers',
        '  - Scanned PDF detection and rejection',
        '  - Full audit trail with manifest.json',
      ],
    },
    {
      title: 'Chapter 2: Methodology',
      body: [
        'The conversion process uses the @opendocsg/pdf2md library as its core',
        'PDF-to-Markdown engine, combined with pdfjs-dist for pre-filtering.',
        '',
        'Each page is processed individually and prefixed with a standardised',
        'page marker comment in the format:',
        '  <!-- page: N of Total -->',
        '  ## Page N',
        '',
        'This ensures that every section of the output Markdown can be traced',
        'back to its exact source page in the original PDF document.',
      ],
    },
    {
      title: 'Chapter 3: Compliance Trail',
      body: [
        'For every conversion job, the tool creates a structured output folder:',
        '',
        '  /output/{YYYY-MM-DD}/{slug}/',
        '    document.md       — Converted Markdown output',
        '    manifest.json     — Full audit metadata',
        '    conversion.log    — Structured processing log',
        '',
        'The manifest includes SHA-256 checksums of both the input PDF and the',
        'output Markdown, along with tool versions, timestamps, and system info.',
        '',
        'This is the final page of the sample document.',
      ],
    },
  ];

  for (const pageData of pages) {
    const page = pdfDoc.addPage([612, 792]); // US Letter
    const { width, height } = page.getSize();

    // Title
    page.drawText(pageData.title, {
      x: 50,
      y: height - 80,
      size: 18,
      font: boldFont,
      color: rgb(0, 0, 0),
    });

    // Body lines
    let y = height - 120;
    for (const line of pageData.body) {
      page.drawText(line, {
        x: 50,
        y,
        size: 11,
        font,
        color: rgb(0, 0, 0),
      });
      y -= 18;
    }
  }

  const pdfBytes = await pdfDoc.save();
  const outPath = path.join(outDir, 'sample-text.pdf');
  fs.writeFileSync(outPath, pdfBytes);
  console.log(`Created: ${outPath} (${pages.length} pages)`);
  return outPath;
}

// ─── 2. Scanned/image-only PDF (2 pages) ─────────────────────────────────────
// We simulate a scanned PDF by creating pages with NO text operators —
// just a filled rectangle (simulating an embedded image scan).

async function createScannedPdf() {
  const pdfDoc = await PDFDocument.create();

  for (let i = 0; i < 2; i++) {
    const page = pdfDoc.addPage([612, 792]);
    const { width, height } = page.getSize();

    // Draw a grey rectangle to simulate a scanned page image (no text content)
    page.drawRectangle({
      x: 30,
      y: 30,
      width: width - 60,
      height: height - 60,
      color: rgb(0.92, 0.92, 0.92),
    });

    // Draw a small label using a very light colour so it's nearly invisible
    // but technically present — however with < 5 chars total it still triggers
    // the scanned-PDF threshold.
    // (We intentionally keep this below the 20-char/page threshold.)
    page.drawText('img', {
      x: width / 2 - 10,
      y: height / 2,
      size: 8,
      color: rgb(0.91, 0.91, 0.91), // nearly invisible
    });
  }

  const pdfBytes = await pdfDoc.save();
  const outPath = path.join(outDir, 'sample-scanned.pdf');
  fs.writeFileSync(outPath, pdfBytes);
  console.log(`Created: ${outPath} (2 pages, image-only simulation)`);
  return outPath;
}

// Run
await createTextPdf();
await createScannedPdf();
console.log('\nSample PDFs generated successfully.');
