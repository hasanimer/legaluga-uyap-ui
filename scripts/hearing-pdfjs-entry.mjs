// Run the PDF.js reader in the package's existing dedicated worker.
// Its in-process message handler avoids a second nested worker and remote loading.
import './hearing-pdfjs-compat.mjs';
import { WorkerMessageHandler } from 'pdfjs-dist/build/pdf.worker.mjs';
import * as reader from 'pdfjs-dist/build/pdf.mjs';

globalThis.pdfjsWorker = { WorkerMessageHandler };
globalThis.DurusmaPaketiPDFJS = reader;
