# pdf2md-compliance

A **local-only, offline** Node.js tool that converts PDF files to Markdown with compliance-grade extensions. Available as both a **CLI** and a **local web GUI**. All processing runs entirely on the local filesystem — no files are ever uploaded to any external server or API.

Built on the [`@opendocsg/pdf2md`](https://github.com/opengovsg/pdf2md) library with compliance extensions including per-page markers, table structure preservation, SHA-256 checksums, structured audit manifests, and scanned-PDF rejection.

---

## Table of Contents

- [Features](#features)
- [Requirements](#requirements)
- [Setup on macOS / Apple Silicon](#setup-on-macos--apple-silicon)
- [Verifying Native arm64 Execution](#verifying-native-arm64-execution)
- [GUI — Local Web Interface](#gui--local-web-interface)
- [Usage (CLI)](#usage-cli)
- [Output Folder Structure](#output-folder-structure)
- [Manifest Fields Reference](#manifest-fields-reference)
- [Scanned-PDF Rejection Logic](#scanned-pdf-rejection-logic)
- [Verifying Checksums Independently](#verifying-checksums-independently)
- [Running Tests](#running-tests)
- [Example Runs](#example-runs)
- [Architecture](#architecture)
- [License and Attribution](#license-and-attribution)

---

## Features

| Feature | Description |
|---|---|
| **Page-by-page conversion** | Each PDF page is converted individually and prefixed with a `<!-- page: N of Total -->` marker |
| **Table Structure Preservation** | Reconstructs column layouts from PDF positioning data into GitHub-Flavoured Markdown (GFM) pipe tables |
| **Scanned-PDF rejection** | Detects image-only PDFs via text extraction and rejects them with a clear error message |
| **SHA-256 checksums** | Computes and records checksums for both the input PDF and the output Markdown file |
| **Audit manifest** | Writes a `manifest.json` with full provenance metadata for every conversion job |
| **Structured logging** | Writes a `conversion.log` with timestamped entries for every processing step |
| **Input archiving** | Copies the original PDF to an `input-archive/` folder with a `.sha256` sidecar file |
| **Batch processing** | Accepts a folder as input (CLI) or multiple files at once (GUI), continuing on per-file errors |
| **Offline / local-only** | Zero network calls, no telemetry, no external API dependencies |
| **arm64 native** | Designed and tested on Apple Silicon (macOS arm64); no Rosetta emulation required |
| **Local web GUI** | Windows 95-styled browser interface for drag-and-drop single and batch conversion |

---

## Requirements

- **Node.js** LTS v22 or v24 (darwin-arm64 build recommended)
- **macOS** (Apple Silicon M-series) — primary target platform
- No `canvas` package required; no browser runtime involved

---

## Setup on macOS / Apple Silicon

### 0. Check if nvm exist on macOS

Open Terminal on macOS

```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Check if .zshrc file exist on macOS
source ~/.zshrc

# If output message says: "source: no such file or directory: /Users/~/.zshrc", create this missing file
touch ~/.zshrc

# Manually add the nvm setup to that file
echo 'export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion" # This loads nvm bash_completion' >> ~/.zshrc

# Load the file
touch ~/.zshrc

# Verify nvm is working
nvm --version

# If a version number displays, such as 0.39.7, then proceed to next part
```


### 1. Install Node.js (arm64 native build)

Use [nvm](https://github.com/nvm-sh/nvm) or download directly from [nodejs.org](https://nodejs.org):

```bash
# Using nvm (recommended)
nvm install 22
nvm use 22

# Verify you have the arm64 native build (not Rosetta x64)
node -p process.arch   # should print: arm64
```

### 2. Clone and install

```bash
git clone https://github.com/jasontgw/pdf2md-compliance-v2.git
cd pdf2md-compliance-v2
npm install
```

### 3. Make the CLI globally available (optional)

```bash
npm link
# Now you can run: pdf2md-compliance --help
```

---

## Verifying Native arm64 Execution

To confirm that Node.js is running natively on Apple Silicon (not under Rosetta x64 emulation):

```bash
node -p process.arch
```

**Expected output:** `arm64`

If you see `x64`, your Node.js installation is running under Rosetta emulation. Download the native arm64 build from [nodejs.org](https://nodejs.org/en/download/) or reinstall via nvm with the correct architecture.

You can also check the full system info:

```bash
node -e "console.log({ arch: process.arch, platform: process.platform, version: process.version })"
# Expected: { arch: 'arm64', platform: 'darwin', version: 'v22.x.x' }
```

---

## GUI — Local Web Interface

A Windows 95-styled local web GUI is included for users who prefer a point-and-click experience over the terminal.

### Option A — Double-click launcher (recommended)

After cloning and running `npm install` once, simply double-click **`Start GUI.command`** in the repository root. macOS will open a Terminal window, start the server, and launch the browser automatically at `http://localhost:3000`.

> **First-time setup:** macOS may block the file with a security warning. Right-click `Start GUI.command` → **Open** → **Open** to allow it once. Subsequent double-clicks will work without the prompt.

### Option B — Terminal command

```bash
npm run gui
```

The browser opens automatically. Press `Ctrl+C` in the terminal to stop the server.

### GUI Features

| Feature | Description |
|---|---|
| **Drag-and-drop** | Drop one or multiple PDF files directly onto the drop zone |
| **Browse to select** | Click the drop zone to open a file picker |
| **Auto SHA-256 checksum** | Computed on every input file before conversion begins |
| **Batch conversion** | All selected files are processed sequentially |
| **Live progress log** | Displayed in a retro terminal-style window with colour-coded status |
| **Results table** | Shows status, page count, input and output checksums, and a download link for each `.md` file |
| **Custom output folder** | Leave blank to use the default `~/pdf2md-output` |

---

## Usage (CLI)

```
pdf2md-compliance --input <path> --output <path> [options]
```

### Options

| Flag | Description | Default |
|---|---|---|
| `-i, --input <path>` | Input PDF file or folder containing PDF files | *(required)* |
| `-o, --output <path>` | Root output folder for all results | *(required)* |
| `-r, --recursive` | Recursively scan subfolders for PDF files | `false` |
| `--scan-threshold <chars>` | Minimum average characters per page to consider a PDF text-based | `20` |
| `--scan-empty-pct <pct>` | Maximum percentage of empty pages before a PDF is rejected as scanned | `80` |
| `-v, --verbose` | Enable verbose/debug logging | `false` |
| `--version` | Print tool version | |
| `-h, --help` | Show help | |

### Examples

**Convert a single PDF:**
```bash
pdf2md-compliance --input ./document.pdf --output ./results
```

**Convert all PDFs in a folder:**
```bash
pdf2md-compliance --input ./pdfs/ --output ./results
```

**Recursively convert all PDFs in a folder tree:**
```bash
pdf2md-compliance --input ./documents/ --output ./results --recursive
```

**Use a stricter scanned-PDF threshold (50 chars/page minimum):**
```bash
pdf2md-compliance --input ./pdfs/ --output ./results --scan-threshold 50
```

**Enable verbose logging:**
```bash
pdf2md-compliance --input ./document.pdf --output ./results --verbose
```

---

## Output Folder Structure

For every successfully converted PDF, the tool creates:

```
{output}/
├── output/
│   └── {YYYY-MM-DD}/
│       └── {filename-slug}/
│           ├── {filename}.md        ← Converted Markdown output
│           ├── manifest.json        ← Full audit metadata
│           └── conversion.log       ← Structured processing log
└── input-archive/
    └── {YYYY-MM-DD}/
        └── {filename-slug}/
            ├── {filename}.pdf       ← Copy of the original input (never modified)
            └── {filename}.pdf.sha256 ← SHA-256 checksum sidecar
```

For **rejected** PDFs (scanned/image-only), the output folder contains only `manifest.json` and `conversion.log` — no `.md` file is written.

---

## Manifest Fields Reference

`manifest.json` is written for every job (success or rejection) and contains:

| Field | Description |
|---|---|
| `toolVersion` | Version of pdf2md-compliance |
| `pdf2mdVersion` | Version of `@opendocsg/pdf2md` |
| `pdfjsDistVersion` | Version of `pdfjs-dist` |
| `nodeVersion` | Node.js version (`process.version`) |
| `nodeArch` | CPU architecture (`process.arch`, e.g. `arm64`) |
| `hostname` | Machine hostname |
| `operator` | OS username of the operator |
| `originalFilename` | Original filename of the input PDF |
| `absoluteInputPath` | Absolute filesystem path of the input PDF |
| `inputSha256` | SHA-256 hex digest of the input PDF |
| `outputSha256` | SHA-256 hex digest of the output Markdown *(SUCCESS only)* |
| `totalPages` | Total number of pages in the PDF |
| `status` | `SUCCESS`, `REJECTED_SCANNED_PDF`, or `ERROR` |
| `conversionStartTime` | ISO 8601 timestamp when the job started |
| `conversionEndTime` | ISO 8601 timestamp when the job completed |
| `rejectionReason` | Human-readable rejection reason *(REJECTED only)* |

---

## Scanned-PDF Rejection Logic

Before attempting conversion, the tool inspects each page's text content using `pdfjs-dist` (via `getTextContent()`). A PDF is classified as **scanned/image-only** if either of the following conditions is met:

1. **Average characters per page** is below `--scan-threshold` (default: **20 characters/page**)
2. **Percentage of empty pages** exceeds `--scan-empty-pct` (default: **80%**)

When a PDF is rejected:

- No `.md` file is written (not even a partial output)
- A `manifest.json` is written with `"status": "REJECTED_SCANNED_PDF"` and the rejection reason
- A `conversion.log` entry records the rejection
- The following error message is printed to stderr:

```
Error: '{filename}' appears to be a scanned/image-only PDF with no extractable text.
This tool does not perform OCR. Please provide a text-based PDF or use an OCR tool first.
```

- The process exits with a **non-zero exit code** (useful for scripting)
- In batch mode, processing **continues** for remaining files

### Adjusting thresholds

For documents with sparse text (e.g. forms, tables), you may need to lower the threshold:

```bash
# Accept PDFs with as few as 5 chars/page on average
pdf2md-compliance --input ./forms/ --output ./results --scan-threshold 5

# Only reject if 95% or more of pages are empty
pdf2md-compliance --input ./pdfs/ --output ./results --scan-empty-pct 95
```

---

## Verifying Checksums Independently

The `manifest.json` records SHA-256 checksums for both the input PDF and the output Markdown. You can verify these independently using standard system tools:

**On macOS:**
```bash
# Verify input PDF checksum
shasum -a 256 ./document.pdf
# Compare with manifest.json → inputSha256

# Verify output Markdown checksum
shasum -a 256 ./results/output/2024-01-15/document/document.md
# Compare with manifest.json → outputSha256
```

**On Linux:**
```bash
sha256sum ./document.pdf
sha256sum ./results/output/2024-01-15/document/document.md
```

**Using the archive sidecar:**
```bash
# The .sha256 sidecar file uses the standard format for sha256sum verification:
sha256sum -c ./results/input-archive/2024-01-15/document/document.pdf.sha256
```

---

## Running Tests

```bash
# Run all tests (includes the version-range pre-check)
npm test

# Run tests only (skip pre-check)
node --experimental-vm-modules node_modules/.bin/jest --runInBand

# Run a specific test suite
node --experimental-vm-modules node_modules/.bin/jest --runInBand --testPathPattern="page-markers"
```

### Test suites

| Suite | What it covers |
|---|---|
| `page-markers.test.js` | Page marker format, count, and ordering for N-page PDFs |
| `table-preservation.test.js` | Verification of GFM pipe-table reconstruction from columnar PDF text |
| `checksum.test.js` | SHA-256 accuracy, determinism, manifest checksum correctness |
| `scan-rejection.test.js` | Scanned-PDF detection, rejection, error messages, no partial output |
| `manifest-log.test.js` | Manifest fields, log creation, archive structure, input file integrity |
| `no-browser-deps.test.js` | No `canvas`, no DOM globals, no network calls, full job without canvas |
| `version-ranges.test.js` | CI guard: detects `^`/`~` prefixes on pinned packages |

---

## Example Runs

### Success path (text-based PDF)

```bash
$ pdf2md-compliance --input ./sample-pdfs/sample-text.pdf --output ./results

pdf2md-compliance: Found 1 PDF file(s) to process.

Processing: /path/to/sample-pdfs/sample-text.pdf
[INFO] Job started: file received
[INFO] Input checksum computed (SHA-256)
[INFO] Input file archived
[INFO] Running scanned-PDF pre-filter...
[INFO] Scanned-PDF check complete  totalPages=3  avgCharsPerPage=422.0  isScanned=false
[INFO] Starting page-by-page PDF → Markdown conversion...
[INFO] All pages converted  totalPages=3
[INFO] Markdown output written
[INFO] Output checksum computed (SHA-256)
[INFO] Job completed successfully

  ✓ SUCCESS  → ./results/output/2024-01-15/sample-text/sample-text.md
    Manifest → ./results/output/2024-01-15/sample-text/manifest.json
    Log      → ./results/output/2024-01-15/sample-text/conversion.log

────────────────────────────────────────────────────────────
Summary: 1 succeeded, 0 rejected (scanned), 0 errored
────────────────────────────────────────────────────────────
```

### Rejection path (scanned/image-only PDF)

```bash
$ pdf2md-compliance --input ./sample-pdfs/sample-scanned.pdf --output ./results

pdf2md-compliance: Found 1 PDF file(s) to process.

Processing: /path/to/sample-pdfs/sample-scanned.pdf
[INFO] Job started: file received
[INFO] Input checksum computed (SHA-256)
[INFO] Input file archived
[INFO] Running scanned-PDF pre-filter...
[INFO] Scanned-PDF check complete  totalPages=2  avgCharsPerPage=3.0  isScanned=true
[ERROR] REJECTED_SCANNED_PDF: sample-scanned.pdf

  ✗ REJECTED → Error: 'sample-scanned.pdf' appears to be a scanned/image-only PDF
                with no extractable text. This tool does not perform OCR.
                Please provide a text-based PDF or use an OCR tool first.
    Manifest → ./results/output/2024-01-15/sample-scanned/manifest.json
    Log      → ./results/output/2024-01-15/sample-scanned/conversion.log

────────────────────────────────────────────────────────────
Summary: 0 succeeded, 1 rejected (scanned), 0 errored
────────────────────────────────────────────────────────────

$ echo $?
1
```

### Output Markdown format

Each page in the output `.md` file is prefixed with a page marker:

```markdown
<!-- page: 1 of 3 -->
## Page 1

# Chapter 1: Introduction

This is the content of page 1...

---

<!-- page: 2 of 3 -->
## Page 2

# Chapter 2: Methodology

This is the content of page 2...
```

---

## Architecture

```
pdf2md-compliance-v2/
├── src/
│   ├── cli.js              ← CLI entry point (CommonJS shebang, loads ESM)
│   ├── batch-runner.mjs    ← Discovers PDFs, runs jobs sequentially
│   ├── job-runner.mjs      ← Orchestrates a single conversion job
│   ├── converter.mjs       ← Page-by-page PDF → Markdown conversion (positional table reconstruction)
│   ├── scan-detector.mjs   ← Scanned-PDF pre-filter (pdfjs-dist via unpdf)
│   ├── compliance.mjs      ← Checksums, manifest, archive, logging
│   ├── index.mjs           ← Public programmatic API exports
│   └── pdfjs-helper.mjs    ← (reference) pdfjs-dist ESM wrapper
├── gui/
│   ├── server.mjs          ← Local Express server (file upload, SHA-256, SSE progress)
│   └── public/
│       └── index.html      ← Windows 95-styled single-page GUI
├── Start GUI.command        ← Double-clickable macOS launcher
├── tests/
│   ├── helpers/
│   │   └── create-test-pdfs.mjs  ← In-memory PDF fixture generator
│   ├── page-markers.test.js
│   ├── table-preservation.test.js
│   ├── checksum.test.js
│   ├── scan-rejection.test.js
│   ├── manifest-log.test.js
│   ├── no-browser-deps.test.js
│   └── version-ranges.test.js
├── scripts/
│   ├── check-version-ranges.js   ← CI guard for pinned versions
│   └── generate-sample-pdfs.mjs  ← Generates sample-pdfs/ fixtures
├── sample-pdfs/
│   ├── sample-text.pdf     ← 3-page text-based PDF for demo/testing
│   └── sample-scanned.pdf  ← 2-page image-only PDF for rejection demo
├── package.json
├── package-lock.json
├── README.md
└── LICENSE
```

---

## License and Attribution

This project is licensed under the **MIT License** — see [LICENSE](./LICENSE) for details.

**Upstream attribution:** This tool is built upon and incorporates the [`@opendocsg/pdf2md`](https://github.com/opengovsg/pdf2md) library, originally developed by the [Open Government Products](https://open.gov.sg/) team at GovTech Singapore, and licensed under the MIT License. No modifications have been made to the upstream library source code.
