/**
 * converter.mjs
 *
 * Page-by-page PDF → Markdown converter.
 *
 * Strategy:
 *   1. Use pdfjs-dist (via unpdf) to load the PDF and iterate pages.
 *   2. For each page, call getTextContent() to obtain all text items with
 *      their x/y coordinates and widths.
 *   3. Group items into rows by their y-coordinate (within a configurable
 *      LINE_TOLERANCE), sort each row left-to-right by x, then reconstruct
 *      the line as a tab-separated string.  This preserves the column
 *      alignment of tables and forms that the upstream @opendocsg/pdf2md
 *      library collapses into a single run of text.
 *   4. Detect whether the page contains a table (multiple rows with ≥2
 *      non-empty cells at consistent x-positions) and, when detected,
 *      emit a GitHub-Flavoured Markdown pipe table instead of plain text.
 *      Page-header rows (name, account number, timestamp, page number) and
 *      standalone title rows are excluded from the table body and emitted
 *      as plain text above the table.
 *   5. Prepend each page's output with the required compliance marker:
 *        <!-- page: {n} of {total} -->
 *        ## Page {n}
 *   6. Return the concatenated Markdown string.
 *
 * Why we replaced the @opendocsg/pdf2md pipeline for the conversion step:
 *   The upstream library's ToMarkdown transformation collapses all text items
 *   on a page into a single string, destroying row/column relationships.
 *   For compliance use-cases (financial statements, transaction histories,
 *   government forms) the positional data available from pdfjs-dist's
 *   getTextContent() is sufficient to reconstruct tabular structure with
 *   high fidelity, making the output suitable for agentic downstream analysis.
 *
 * NOTE: scan-detector.mjs already uses unpdf/getDocumentProxy.  We reuse the
 * same loader here so there is no additional dependency.
 */

import { getDocumentProxy } from 'unpdf';

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Two text items are considered to be on the same line when their y-coordinates
 * differ by no more than LINE_TOLERANCE points.
 */
const LINE_TOLERANCE = 3;

/**
 * Minimum number of rows (including header) that must share a consistent
 * two-column structure before we render the page as a GFM pipe table.
 */
const MIN_TABLE_ROWS = 3;

/**
 * Maximum y-coordinate (from bottom of page) for page-footer items such as
 * "N of M" page numbers.  Items below this threshold are excluded from the
 * main content area.
 */
const FOOTER_Y_MAX = 60;

/**
 * Minimum y-coordinate (from bottom of page) for page-header items such as
 * the account holder name and timestamp printed at the very top of each page.
 * Items above this threshold are treated as running headers and excluded from
 * the table body.
 */
const HEADER_Y_MIN = 700;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Convert a Node.js Buffer to a plain Uint8Array that pdfjs-dist accepts.
 * @param {Buffer|Uint8Array} input
 * @returns {Uint8Array}
 */
function toUint8Array(input) {
  if (Buffer.isBuffer(input)) return new Uint8Array(input);
  if (input instanceof Uint8Array) return new Uint8Array(input);
  return new Uint8Array(input);
}

/**
 * Group pdfjs TextItem objects into logical lines by y-coordinate proximity.
 *
 * @param {Array} items  - Raw items from getTextContent()
 * @returns {Array<{y: number, items: Array}>}  Rows sorted top-to-bottom.
 */
function groupItemsIntoRows(items) {
  const rows = [];

  for (const item of items) {
    if (!item.str || item.str.trim() === '') continue;

    const [, , , , x, y] = item.transform;
    const roundedY = Math.round(y);

    let matched = null;
    for (const row of rows) {
      if (Math.abs(row.y - roundedY) <= LINE_TOLERANCE) {
        matched = row;
        break;
      }
    }

    if (matched) {
      matched.items.push({ str: item.str.trim(), x: Math.round(x), width: Math.round(item.width) });
    } else {
      rows.push({
        y: roundedY,
        items: [{ str: item.str.trim(), x: Math.round(x), width: Math.round(item.width) }],
      });
    }
  }

  // Sort rows top-to-bottom (PDF y-axis is bottom-up → descending y = top)
  rows.sort((a, b) => b.y - a.y);

  // Sort items within each row left-to-right
  for (const row of rows) {
    row.items.sort((a, b) => a.x - b.x);
  }

  return rows;
}

/**
 * Separate rows into three buckets:
 *   - runningHeader: rows above HEADER_Y_MIN (account name, timestamp)
 *   - footer:        rows below FOOTER_Y_MAX (page number)
 *   - body:          everything in between
 *
 * @param {Array} rows
 * @returns {{ header: Array, body: Array, footer: Array }}
 */
function partitionRows(rows) {
  const header = rows.filter(r => r.y >= HEADER_Y_MIN);
  const footer = rows.filter(r => r.y <= FOOTER_Y_MAX);
  const body   = rows.filter(r => r.y > FOOTER_Y_MAX && r.y < HEADER_Y_MIN);
  return { header, body, footer };
}

/**
 * Detect whether a set of body rows looks like a two-column table.
 *
 * Heuristic: at least MIN_TABLE_ROWS rows each have exactly two distinct
 * x-positions, and those positions are consistent (within 10 pts) across rows.
 *
 * @param {Array} rows
 * @returns {boolean}
 */
function looksLikeTable(rows) {
  const multiCellRows = rows.filter(r => r.items.length >= 2);
  if (multiCellRows.length < MIN_TABLE_ROWS) return false;

  const firstXValues = multiCellRows.map(r => r.items[0].x);
  const minX = Math.min(...firstXValues);
  const maxX = Math.max(...firstXValues);
  return (maxX - minX) <= 10;
}

/**
 * Determine column boundaries from body rows.
 * Returns an array of x-positions representing the left edge of each column,
 * clustered so that nearby positions (within 15 pts) map to the same column.
 *
 * @param {Array} rows
 * @returns {number[]}
 */
function detectColumnBoundaries(rows) {
  const allX = [];
  for (const row of rows) {
    for (const item of row.items) {
      allX.push(item.x);
    }
  }
  allX.sort((a, b) => a - b);

  const boundaries = [];
  for (const x of allX) {
    const existing = boundaries.find(b => Math.abs(b - x) <= 15);
    if (!existing) boundaries.push(x);
  }
  boundaries.sort((a, b) => a - b);
  return boundaries;
}

/**
 * Assign each item in a row to the nearest column boundary.
 * Returns an array of cell strings (empty string for missing cells).
 *
 * @param {Array} rowItems
 * @param {number[]} boundaries
 * @returns {string[]}
 */
function assignCells(rowItems, boundaries) {
  const cells = new Array(boundaries.length).fill('');
  for (const item of rowItems) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < boundaries.length; i++) {
      const dist = Math.abs(item.x - boundaries[i]);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    cells[bestIdx] = cells[bestIdx] ? cells[bestIdx] + ' ' + item.str : item.str;
  }
  return cells;
}

/**
 * Render rows as a GitHub-Flavoured Markdown pipe table.
 * The first row is treated as the header; a separator row is inserted below it.
 * Trailing empty columns are trimmed from every row.
 *
 * @param {Array} rows
 * @param {number[]} boundaries
 * @returns {string}
 */
function renderGfmTable(rows, boundaries) {
  // Build raw cell matrix
  const matrix = rows.map(row => assignCells(row.items, boundaries));

  // Determine the maximum non-empty column index across all rows
  let maxCol = 0;
  for (const cells of matrix) {
    for (let i = cells.length - 1; i >= 0; i--) {
      if (cells[i].trim() !== '') {
        if (i > maxCol) maxCol = i;
        break;
      }
    }
  }
  const colCount = maxCol + 1;

  const lines = [];
  matrix.forEach((cells, idx) => {
    const trimmed = cells.slice(0, colCount);
    const line = '| ' + trimmed.join(' | ') + ' |';
    lines.push(line);
    if (idx === 0) {
      const sep = '| ' + trimmed.map(() => '---').join(' | ') + ' |';
      lines.push(sep);
    }
  });

  return lines.join('\n');
}

/**
 * Render rows as plain text (one line per row, cells separated by two spaces).
 *
 * @param {Array} rows
 * @returns {string}
 */
function renderPlainText(rows) {
  return rows.map(row => row.items.map(i => i.str).join('  ')).join('\n');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Convert a PDF buffer to Markdown with per-page markers.
 *
 * Each page is processed independently using pdfjs-dist's getTextContent()
 * to preserve the spatial layout of tables and multi-column content.
 *
 * @param {Buffer} pdfBuffer  - Raw PDF file contents
 * @param {object} [options]
 * @param {function} [options.onPageConverted]  - Called with (pageNumber, totalPages) after each page
 * @returns {Promise<{ markdown: string, totalPages: number }>}
 */
export async function convertPdfToMarkdown(pdfBuffer, options = {}) {
  const { onPageConverted } = options;

  const data = toUint8Array(pdfBuffer);
  const pdfDoc = await getDocumentProxy(data, { verbosity: 0 });
  const totalPages = pdfDoc.numPages;

  const pageMarkdowns = [];

  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
    const page = await pdfDoc.getPage(pageNumber);

    let pageContent = '';

    try {
      const textContent = await page.getTextContent();
      const allRows = groupItemsIntoRows(textContent.items);
      const { header, body, footer } = partitionRows(allRows);

      const parts = [];

      // Running header (account name, timestamp) — always plain text
      if (header.length > 0) {
        parts.push(renderPlainText(header));
      }

      // Body content — table or plain text
      if (body.length > 0) {
        if (looksLikeTable(body)) {
          const boundaries = detectColumnBoundaries(body);
          parts.push(renderGfmTable(body, boundaries));
        } else {
          parts.push(renderPlainText(body));
        }
      }

      // Footer (page number) — plain text, separated by a blank line
      if (footer.length > 0) {
        parts.push(renderPlainText(footer));
      }

      pageContent = parts.join('\n\n');
    } finally {
      if (typeof page.cleanup === 'function') {
        try { await page.cleanup(true); } catch (_) { /* ignore */ }
      }
    }

    const marker = `<!-- page: ${pageNumber} of ${totalPages} -->\n## Page ${pageNumber}`;
    pageMarkdowns.push(`${marker}\n\n${pageContent.trim()}`);

    if (typeof onPageConverted === 'function') {
      onPageConverted(pageNumber, totalPages);
    }
  }

  await pdfDoc.destroy();

  const markdown = pageMarkdowns.join('\n\n---\n\n') + '\n';
  return { markdown, totalPages };
}
