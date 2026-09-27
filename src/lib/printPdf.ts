export type SavePdfResult = 'saved' | 'cancelled' | 'printed' | 'error';

declare global {
  interface Window {
    electronAPI?: {
      getApiPort: () => Promise<number>;
      getUserDataPath: () => Promise<string>;
      isElectron?: boolean;
      savePdf?: (fileName: string, options?: { halfPage?: boolean }) => Promise<{
        ok: boolean;
        cancelled?: boolean;
        filePath?: string;
        error?: string;
      }>;
      silentPrint?: (options?: { halfPage?: boolean }) => Promise<{ ok: boolean; error?: string }>;
    };
  }
}

/**
 * Returns the cleanest inner document element to print or capture,
 * avoiding the modal's outer scroll containers, padding, and grey borders.
 */
export function getTargetPrintElement(): HTMLElement | null {
  return (
    document.querySelector('#print-preview-content .print-document-sheet') ||
    document.querySelector('#print-preview-content .print-document') ||
    document.querySelector('#print-preview-content .invoice-card') ||
    document.querySelector('.print-document-sheet') ||
    document.querySelector('.print-document') ||
    document.querySelector('.invoice-card') ||
    document.querySelector('#print-preview-content')
  ) as HTMLElement | null;
}

/**
 * Activate print-mode on the page: hides everything except a cloned copy of the
 * clean document sheet. Also temporarily sets document.title so browser print-to-PDF
 * automatically defaults to the suggested filename.
 */
function enterPrintMode(options?: { halfPage?: boolean; fileName?: string }): (() => void) | null {
  const sourceEl = getTargetPrintElement();
  if (!sourceEl) return null;

  const originalTitle = document.title;
  if (options?.fileName) {
    document.title = sanitizePdfName(options.fileName.replace(/\.pdf$/i, ''));
  }

  // Create a full-page overlay with ONLY the document content
  const overlay = document.createElement('div');
  overlay.id = 'pdf-print-overlay';
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 99999;
    background: #fff;
    overflow: visible;
    padding: 0 !important;
    margin: 0 !important;
    box-sizing: border-box;
  `;

  // Clone the clean print document content
  const clone = sourceEl.cloneNode(true) as HTMLElement;
  clone.style.setProperty('max-height', 'none', 'important');
  clone.style.setProperty('overflow', 'visible', 'important');
  clone.style.setProperty('border', 'none', 'important');
  clone.style.setProperty('border-radius', '0', 'important');
  clone.style.setProperty('box-shadow', 'none', 'important');
  clone.style.setProperty('margin', '0 auto', 'important');
  clone.style.setProperty('width', '100%', 'important');
  overlay.appendChild(clone);

  // Add class to body to hide everything else
  document.body.classList.add('pdf-capture-mode');
  if (options?.halfPage) {
    document.body.classList.add('half-page-receipt');
  }
  document.body.appendChild(overlay);

  return () => {
    document.body.classList.remove('pdf-capture-mode');
    document.body.classList.remove('half-page-receipt');
    overlay.remove();
    document.title = originalTitle;
  };
}

/** Open the OS print dialog using the clean overlay mode with preset filename. */
export async function triggerPrint(options?: { halfPage?: boolean; fileName?: string }): Promise<void> {
  const cleanup = enterPrintMode(options);
  // Allow DOM to paint the overlay
  await new Promise((r) => setTimeout(r, 200));

  await new Promise<void>((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      window.removeEventListener('afterprint', finish);
      cleanup?.();
      resolve();
    };

    window.addEventListener('afterprint', finish);

    try {
      window.print();
    } catch {
      finish();
    }

    // Safety fallback: ensure cleanup happens even if afterprint doesn't fire
    setTimeout(finish, 3000);
  });
}

/**
 * Silent print — sends directly to the default printer without showing
 * a printer selection dialog in Electron. Falls back to triggerPrint in browser mode.
 * Pass halfPage=true for invoice receipts so the page size matches the receipt.
 */
export async function triggerSilentPrint(options?: { halfPage?: boolean; fileName?: string }): Promise<'printed' | 'error'> {
  if (window.electronAPI?.silentPrint) {
    const cleanup = enterPrintMode(options);
    await new Promise((r) => setTimeout(r, 200));
    try {
      const res = await window.electronAPI.silentPrint(options);
      return res.ok ? 'printed' : 'error';
    } finally {
      cleanup?.();
    }
  }
  // Browser fallback — open native print dialog with preset filename
  await triggerPrint(options);
  return 'printed';
}

/**
 * Save the current print view as a PDF (Electron) or direct/print PDF in the browser.
 * Uses an offscreen A4 sandbox container to completely eliminate left/right text clipping.
 */
export async function savePrintPdf(
  fileName: string,
  options?: { halfPage?: boolean }
): Promise<SavePdfResult> {
  const suggested = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
  try {
    if (window.electronAPI?.savePdf) {
      // Enter print mode — show only the document
      const cleanup = enterPrintMode({ ...options, fileName: suggested });

      // Give the browser a moment to paint the overlay
      await new Promise((r) => setTimeout(r, 200));

      try {
        const res = await window.electronAPI.savePdf(suggested, options);
        if (res.cancelled) return 'cancelled';
        if (res.ok) return 'saved';
        console.warn('[savePrintPdf] electronAPI.savePdf returned not ok:', res.error);
      } finally {
        cleanup?.();
      }
    }
  } catch (err) {
    console.warn('[savePrintPdf] electronAPI.savePdf threw exception:', err);
  }

  // Browser mode: directly generate and download PDF file to computer via offscreen sandbox
  try {
    const sourceEl = getTargetPrintElement();

    if (sourceEl) {
      // @ts-ignore - html2pdf.js module typing
      const html2pdfModule = await import('html2pdf.js');
      const html2pdf = html2pdfModule.default || html2pdfModule;

      // Sandbox container placed off-screen, completely detached from modal styling,
      // scrolls, flex centering, or overflow clipping.
      const sandboxWidth = options?.halfPage ? 560 : 794; // 794px = standard A4 @ 96 DPI
      const sandbox = document.createElement('div');
      sandbox.id = 'pdf-sandbox-container';
      sandbox.style.cssText = `
        position: fixed;
        top: 0;
        left: -9999px;
        width: ${sandboxWidth}px;
        background: #ffffff;
        margin: 0;
        padding: ${options?.halfPage ? '10px' : '20px'};
        box-sizing: border-box;
        z-index: -10000;
        overflow: visible;
      `;

      // Deep clone the clean document sheet
      const clone = sourceEl.cloneNode(true) as HTMLElement;
      clone.style.setProperty('width', '100%', 'important');
      clone.style.setProperty('max-width', '100%', 'important');
      clone.style.setProperty('min-width', '0', 'important');
      clone.style.setProperty('margin', '0', 'important');
      clone.style.setProperty('border', 'none', 'important');
      clone.style.setProperty('border-radius', '0', 'important');
      clone.style.setProperty('box-shadow', 'none', 'important');
      clone.style.setProperty('max-height', 'none', 'important');
      clone.style.setProperty('overflow', 'visible', 'important');

      sandbox.appendChild(clone);
      document.body.appendChild(sandbox);

      try {
        const opt: any = {
          margin: options?.halfPage ? [4, 4, 4, 4] : [6, 6, 6, 6],
          filename: suggested,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: {
            scale: 2.5,
            useCORS: true,
            logging: false,
            letterRendering: true,
            scrollX: 0,
            scrollY: 0,
            x: 0,
            y: 0,
            windowWidth: sandboxWidth,
          },
          jsPDF: {
            unit: 'mm',
            format: options?.halfPage ? 'a5' : 'a4',
            orientation: 'portrait',
          },
          pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
        };

        const worker = (html2pdf() as any).set(opt).from(clone);

        try {
          await worker.save();
          return 'saved';
        } catch (downloadErr) {
          console.warn('[savePrintPdf] worker.save() failed or restricted by browser, opening in new tab:', downloadErr);
          const blob = await worker.output('blob');
          if (blob) {
            const blobUrl = URL.createObjectURL(blob);
            window.open(blobUrl, '_blank');
            setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
            return 'saved';
          }
        }
      } finally {
        sandbox.remove();
      }
    }
  } catch (err) {
    console.warn('[savePrintPdf] Direct browser PDF generation failed, falling back to print dialog:', err);
  }

  // Fallback if direct download fails
  await triggerPrint({ ...options, fileName: suggested });
  return 'printed';
}

export function sanitizePdfName(name: string) {
  return name.replace(/[<>:"/\\|?*]+/g, '-').replace(/\s+/g, '_');
}
