/**
 * table-preservation.test.js
 *
 * Verifies that the converter reconstructs tabular content from PDFs that
 * contain text items positioned in columns, emitting a valid GitHub-Flavoured
 * Markdown (GFM) pipe table rather than a collapsed single-line string.
 *
 * Background:
 *   The upstream @opendocsg/pdf2md library's ToMarkdown transformation
 *   concatenates all text items on a page into a single run, destroying
 *   row/column relationships.  The revised converter.mjs uses pdfjs-dist's
 *   getTextContent() positional data to reconstruct table structure.
 *
 * Test strategy:
 *   1. Use the createTablePdf() fixture to generate an in-memory PDF with a
 *      known two-column layout (Code | Description, 3 data rows).
 *   2. Convert it with convertPdfToMarkdown() and assert:
 *        a. The output contains GFM pipe-table syntax (| ... | ... |).
 *        b. Each expected cell value appears in the output.
 *        c. Each row's code and description appear on the SAME line (i.e. the
 *           column relationship is preserved, not split across lines).
 *        d. The page marker and heading are still present.
 */

'use strict';

async function importEsm(specifier) {
  return import(specifier);
}

describe('Table Structure Preservation', () => {
  let createTablePdf;
  let convertPdfToMarkdown;

  beforeAll(async () => {
    const helpers = await importEsm('./helpers/create-test-pdfs.mjs');
    createTablePdf = helpers.createTablePdf;

    const converter = await importEsm('../src/converter.mjs');
    convertPdfToMarkdown = converter.convertPdfToMarkdown;
  });

  test('table PDF produces GFM pipe-table syntax', async () => {
    const buf = await createTablePdf();
    const { markdown } = await convertPdfToMarkdown(buf);

    // Must contain at least one pipe-table row
    expect(markdown).toMatch(/\|.+\|/);
  });

  test('table PDF output contains a GFM separator row', async () => {
    const buf = await createTablePdf();
    const { markdown } = await convertPdfToMarkdown(buf);

    // Separator row: | --- | --- |
    expect(markdown).toMatch(/\|\s*---\s*\|/);
  });

  test('header row cells appear in the output', async () => {
    const buf = await createTablePdf();
    const { markdown } = await convertPdfToMarkdown(buf);

    expect(markdown).toContain('Code');
    expect(markdown).toContain('Description');
  });

  test('each data row code and description appear on the same line', async () => {
    const buf = await createTablePdf();
    const { markdown } = await convertPdfToMarkdown(buf);

    const lines = markdown.split('\n');

    const dataRows = [
      { code: 'AAA', desc: 'First description text' },
      { code: 'BBB', desc: 'Second description text' },
      { code: 'CCC', desc: 'Third description text' },
    ];

    for (const { code, desc } of dataRows) {
      const matchingLine = lines.find(line => line.includes(code) && line.includes(desc));
      expect(matchingLine).toBeDefined();
    }
  });

  test('page marker and heading are still present in table output', async () => {
    const buf = await createTablePdf();
    const { markdown } = await convertPdfToMarkdown(buf);

    expect(markdown).toMatch(/<!-- page: 1 of 1 -->/);
    expect(markdown).toMatch(/## Page 1/);
  });

  test('non-table PDF does not produce pipe-table syntax', async () => {
    const helpers = await importEsm('./helpers/create-test-pdfs.mjs');
    const buf = await helpers.createTextPdf(1);
    const { markdown } = await convertPdfToMarkdown(buf);

    // Single-column prose should not be rendered as a pipe table
    const pipeTableLines = markdown.split('\n').filter(l => /^\|/.test(l));
    expect(pipeTableLines.length).toBe(0);
  });
});
