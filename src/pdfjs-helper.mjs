/**
 * pdfjs-helper.mjs
 *
 * Thin ESM wrapper around pdfjs-dist for Node.js (no canvas, no browser DOM).
 * Provides getDocument and version from the pdfjs-dist ESM build.
 *
 * We use the ESM build (build/pdf.mjs) because pdfjs-dist v4+ ships ESM-first.
 * The legacy/build path is not present in v4; the main build/pdf.mjs is the
 * correct Node.js entry point.
 *
 * We explicitly set GlobalWorkerOptions.workerSrc = '' to disable the worker
 * thread (not needed for text extraction in Node.js).
 */

import { getDocument, GlobalWorkerOptions, version } from 'pdfjs-dist';

// Disable the PDF.js worker — not needed for server-side text extraction
GlobalWorkerOptions.workerSrc = '';

export { getDocument, version };
