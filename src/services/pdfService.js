/**
 * src/services/pdfService.js
 *
 * Extracts plain text from an uploaded lesson/topic PDF so it can be
 * used as the "topics" input for AI question paper generation.
 *
 * Requires: npm install pdf-parse
 *
 * IMPORTANT LIMITATION: this only works on PDFs that contain real text
 * (typed documents, exported lesson plans, textbook chapters saved as PDF).
 * It does NOT do OCR — a scanned/photographed PDF with no text layer
 * will return little or no usable content. If a teacher uploads a scanned
 * PDF and gets an empty/garbled result, that's why.
 */

// Requires pdf-parse@1.1.1 pinned (see setup notes above) — that version
// exports the parser function directly, no .default wrapping needed.
const pdfParse = require('pdf-parse')

const MAX_CHARS = 6000 // keep the extracted text within a sane prompt size

async function extractTextFromPdf(buffer) {
  const data = await pdfParse(buffer)
  let text = (data.text || '').replace(/\s+/g, ' ').trim()

  if (!text) {
    throw new Error('No readable text found in this PDF. It may be a scanned document without a text layer — try typing the topics manually instead.')
  }

  if (text.length > MAX_CHARS) {
    text = text.slice(0, MAX_CHARS) + '… [truncated — trim this down to the most relevant sections before generating]'
  }

  return text
}

module.exports = { extractTextFromPdf }