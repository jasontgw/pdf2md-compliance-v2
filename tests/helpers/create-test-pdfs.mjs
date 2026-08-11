/**
 * create-test-pdfs.mjs
 *
 * Helper that creates minimal test PDF fixtures in memory using pdf-lib.
 * Returns Buffer objects for use in tests — no filesystem writes.
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/**
 * Create a text-based PDF with N pages, each containing real extractable text.
 *
 * @param {number} numPages
 * @returns {Promise<Buffer>}
 */
export async function createTextPdf(numPages = 3) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  for (let i = 1; i <= numPages; i++) {
    const page = pdfDoc.addPage([612, 792]);
    const { height } = page.getSize();

    page.drawText(`Page ${i} of ${numPages} — This is test content for page ${i}.`, {
      x: 50,
      y: height - 100,
      size: 14,
      font,
      color: rgb(0, 0, 0),
    });

    page.drawText(
      `Lorem ipsum dolor sit amet, consectetur adipiscing elit. ` +
      `Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ` +
      `Page number: ${i}. Total pages: ${numPages}.`,
      {
        x: 50,
        y: height - 140,
        size: 11,
        font,
        color: rgb(0, 0, 0),
      }
    );
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

/**
 * Create a scanned/image-only PDF with N pages (no extractable text).
 *
 * @param {number} numPages
 * @returns {Promise<Buffer>}
 */
export async function createScannedPdf(numPages = 2) {
  const pdfDoc = await PDFDocument.create();

  for (let i = 0; i < numPages; i++) {
    const page = pdfDoc.addPage([612, 792]);
    const { width, height } = page.getSize();

    // Grey rectangle simulating a scanned image — no text operators
    page.drawRectangle({
      x: 30,
      y: 30,
      width: width - 60,
      height: height - 60,
      color: rgb(0.9, 0.9, 0.9),
    });
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

/**
 * Create a single-page text PDF with a specific text string.
 *
 * @param {string} text
 * @returns {Promise<Buffer>}
 */
export async function createSinglePagePdf(text) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const page = pdfDoc.addPage([612, 792]);

  page.drawText(text, {
    x: 50,
    y: 700,
    size: 12,
    font,
    color: rgb(0, 0, 0),
  });

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

/**
 * Create a single-page PDF containing a simple two-column table.
 *
 * The table has a header row ("Code" | "Description") followed by data rows
 * where each row has a short code in column 1 (x≈50) and a description in
 * column 2 (x≈150).  This fixture is used to verify that the converter
 * reconstructs column structure into a GFM pipe table.
 *
 * Layout (y positions, bottom-up):
 *   y=650  Code          Description
 *   y=630  AAA           First description text
 *   y=610  BBB           Second description text
 *   y=590  CCC           Third description text
 *
 * @returns {Promise<Buffer>}
 */
export async function createTablePdf() {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const page = pdfDoc.addPage([612, 792]);

  const rows = [
    { label: 'Code',        desc: 'Description',        y: 650 },
    { label: 'AAA',         desc: 'First description text',   y: 630 },
    { label: 'BBB',         desc: 'Second description text',  y: 610 },
    { label: 'CCC',         desc: 'Third description text',   y: 590 },
  ];

  for (const row of rows) {
    page.drawText(row.label, { x: 50,  y: row.y, size: 11, font, color: rgb(0, 0, 0) });
    page.drawText(row.desc,  { x: 150, y: row.y, size: 11, font, color: rgb(0, 0, 0) });
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
