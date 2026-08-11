/**
 * page-markers.test.js
 *
 * Tests that the converter inserts exactly N page markers for an N-page PDF,
 * in the correct order and with the correct format.
 *
 * Requirement: "Write unit tests confirming that for a known N-page test PDF,
 * the output .md contains exactly N page markers in the correct order."
 */

'use strict';

const { createRequire } = require('module');

// We need to import ESM modules from Jest (CommonJS runner).
// Use a helper to dynamically import them.
async function importEsm(specifier) {
  return import(specifier);
}

describe('Page Marker Correctness', () => {
  let createTextPdf;
  let convertPdfToMarkdown;

  beforeAll(async () => {
    const helpers = await importEsm('./helpers/create-test-pdfs.mjs');
    createTextPdf = helpers.createTextPdf;

    const converter = await importEsm('../src/converter.mjs');
    convertPdfToMarkdown = converter.convertPdfToMarkdown;
  });

  test('1-page PDF produces exactly 1 page marker', async () => {
    const buf = await createTextPdf(1);
    const { markdown, totalPages } = await convertPdfToMarkdown(buf);

    expect(totalPages).toBe(1);

    const markers = markdown.match(/<!-- page: \d+ of \d+ -->/g) || [];
    expect(markers).toHaveLength(1);
    expect(markers[0]).toBe('<!-- page: 1 of 1 -->');
  });

  test('3-page PDF produces exactly 3 page markers in correct order', async () => {
    const buf = await createTextPdf(3);
    const { markdown, totalPages } = await convertPdfToMarkdown(buf);

    expect(totalPages).toBe(3);

    const markers = markdown.match(/<!-- page: \d+ of \d+ -->/g) || [];
    expect(markers).toHaveLength(3);
    expect(markers[0]).toBe('<!-- page: 1 of 3 -->');
    expect(markers[1]).toBe('<!-- page: 2 of 3 -->');
    expect(markers[2]).toBe('<!-- page: 3 of 3 -->');
  });

  test('5-page PDF produces exactly 5 page markers in correct order', async () => {
    const buf = await createTextPdf(5);
    const { markdown, totalPages } = await convertPdfToMarkdown(buf);

    expect(totalPages).toBe(5);

    const markers = markdown.match(/<!-- page: \d+ of \d+ -->/g) || [];
    expect(markers).toHaveLength(5);

    for (let i = 1; i <= 5; i++) {
      expect(markers[i - 1]).toBe(`<!-- page: ${i} of 5 -->`);
    }
  });

  test('Each page marker is followed by a ## Page N heading', async () => {
    const buf = await createTextPdf(3);
    const { markdown } = await convertPdfToMarkdown(buf);

    for (let i = 1; i <= 3; i++) {
      const markerPattern = new RegExp(
        `<!-- page: ${i} of 3 -->\\s*## Page ${i}`
      );
      expect(markdown).toMatch(markerPattern);
    }
  });

  test('Page markers appear in ascending order (no out-of-order pages)', async () => {
    const buf = await createTextPdf(4);
    const { markdown } = await convertPdfToMarkdown(buf);

    const markerRegex = /<!-- page: (\d+) of (\d+) -->/g;
    const pageNumbers = [];
    let match;
    while ((match = markerRegex.exec(markdown)) !== null) {
      pageNumbers.push(parseInt(match[1], 10));
    }

    expect(pageNumbers).toEqual([1, 2, 3, 4]);
  });

  test('totalPages in markers matches actual page count', async () => {
    const buf = await createTextPdf(6);
    const { markdown, totalPages } = await convertPdfToMarkdown(buf);

    expect(totalPages).toBe(6);

    const markerRegex = /<!-- page: \d+ of (\d+) -->/g;
    let match;
    while ((match = markerRegex.exec(markdown)) !== null) {
      expect(parseInt(match[1], 10)).toBe(6);
    }
  });
});
