/**
 * scan-detector.mjs
 *
 * Pre-filter: uses pdfjs-dist (via unpdf, the same loader that @opendocsg/pdf2md uses)
 * to inspect each page's text content via getTextContent() and classifies the PDF as
 * "scanned/image-only" if:
 *
 *   1. The average extractable text across all pages is below `minCharsPerPage`
 *      (default: 20 characters).
 *   2. More than `maxEmptyPagePct` percent of pages return empty text items
 *      (default: 80%).
 *
 * We use unpdf's getDocumentProxy() rather than calling pdfjs-dist directly because
 * unpdf handles the Node.js worker-less pdfjs configuration automatically (the same
 * way @opendocsg/pdf2md does), avoiding the "No GlobalWorkerOptions.workerSrc" error.
 *
 * Returns a ScanResult object with:
 *   - isScanned {boolean}
 *   - totalPages {number}
 *   - emptyPages {number}
 *   - totalChars {number}
 *   - avgCharsPerPage {number}
 *   - emptyPagePct {number}
 *   - reason {string|null}  — human-readable reason if isScanned is true
 */

import { getDocumentProxy } from 'unpdf';

/**
 * Convert a Node.js Buffer to a plain Uint8Array that pdfjs-dist accepts.
 * @param {Buffer|Uint8Array|ArrayBuffer} input
 * @returns {Uint8Array}
 */
function toUint8Array(input) {
  if (Buffer.isBuffer(input)) {
    // Create a COPY of the buffer data.
    // This prevents the original buffer from being "detached" when the 
    // PDF document is destroyed after the scan check.
    return new Uint8Array(input);
  }
  if (input instanceof Uint8Array) {
    // Also copy Uint8Array to be safe
    return new Uint8Array(input);
  }
  return new Uint8Array(input);
}

/**
 * @param {Buffer|Uint8Array} pdfBuffer
 * @param {object} [options]
 * @param {number} [options.minCharsPerPage=20]
 * @param {number} [options.maxEmptyPagePct=80]
 * @returns {Promise<ScanResult>}
 */
export async function detectScannedPdf(pdfBuffer, options = {}) {
  const minCharsPerPage = options.minCharsPerPage ?? 20;
  const maxEmptyPagePct = options.maxEmptyPagePct ?? 80;

  const data = toUint8Array(pdfBuffer);
  const pdfDoc = await getDocumentProxy(data, { verbosity: 0 });
  const totalPages = pdfDoc.numPages;

  let totalChars = 0;
  let emptyPages = 0;

  for (let i = 1; i <= totalPages; i++) {
    const page = await pdfDoc.getPage(i);
    try {
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map(item => (item.str || ''))
        .join('');
      const charCount = pageText.trim().length;
      totalChars += charCount;
      if (charCount === 0) {
        emptyPages++;
      }
    } finally {
      if (typeof page.cleanup === 'function') {
        try { await page.cleanup(true); } catch (_) { /* ignore */ }
      }
    }
  }

  await pdfDoc.destroy();

  const avgCharsPerPage = totalPages > 0 ? totalChars / totalPages : 0;
  const emptyPagePct = totalPages > 0 ? (emptyPages / totalPages) * 100 : 100;

  let isScanned = false;
  let reason = null;

  if (avgCharsPerPage < minCharsPerPage) {
    isScanned = true;
    reason =
      `Average extractable text per page (${avgCharsPerPage.toFixed(1)} chars) ` +
      `is below the threshold of ${minCharsPerPage} chars/page.`;
  } else if (emptyPagePct > maxEmptyPagePct) {
    isScanned = true;
    reason =
      `${emptyPagePct.toFixed(1)}% of pages have no extractable text, ` +
      `exceeding the threshold of ${maxEmptyPagePct}%.`;
  }

  return {
    isScanned,
    totalPages,
    emptyPages,
    totalChars,
    avgCharsPerPage,
    emptyPagePct,
    reason,
  };
}
