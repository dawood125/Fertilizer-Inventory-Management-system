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
 * Activate print-mode on the page: hides everything except a cloned copy of the
 * `#print-preview-content` (or `.print-document`) content.
 */
function enterPrintMode(options?: { halfPage?: boolean }): (() => void) | null {
  const sourceEl = document.querySelector('#print-preview-content') || document.querySelector('.print-document');
  if (!sourceEl) return null;

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

  // Clone the print document content
  const clone = sourceEl.cloneNode(true) as HTMLElement;
  // Remove any max-height / overflow constraints from the clone and ensure strict 0 margins/paddings
  clone.style.setProperty('max-height', 'none', 'important');
  clone.style.setProperty('overflow', 'visible', 'important');
  clone.style.setProperty('border', 'none', 'important');
  clone.style.setProperty('border-radius', '0', 'important');
  clone.style.setProperty('padding', '0', 'important');
  clone.style.setProperty('margin', '0', 'important');
  clone.style.setProperty('box-shadow', 'none', 'important');
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
  };
}

/** Open the OS print dialog using the clean overlay mode. */
export async function triggerPrint(options?: { halfPage?: boolean }): Promise<void> {
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
 * a printer selection dialog. Falls back to triggerPrint in browser mode.
 * Pass halfPage=true for invoice receipts so the page size matches the receipt.
 */
export async function triggerSilentPrint(options?: { halfPage?: boolean }): Promise<'printed' | 'error'> {
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
  // Browser fallback — open normal print dialog
  await triggerPrint(options);
  return 'printed';
}

/** Save the current print view as a PDF (Electron) or open the print dialog (browser). */
export async function savePrintPdf(
  fileName: string,
  options?: { halfPage?: boolean }
): Promise<SavePdfResult> {
  const suggested = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
  try {
    if (window.electronAPI?.savePdf) {
      // Enter print mode — show only the document
      const cleanup = enterPrintMode(options);

      // Give the browser a moment to paint the overlay
      await new Promise((r) => setTimeout(r, 200));

      try {
        const res = await window.electronAPI.savePdf(suggested, options);
        if (res.cancelled) return 'cancelled';
        if (res.ok) return 'saved';
        console.warn('[savePrintPdf] electronAPI.savePdf returned not ok:', res.error);
      } finally {
        // Always restore the page
        cleanup?.();
      }
    }
  } catch (err) {
    console.warn('[savePrintPdf] electronAPI.savePdf threw exception:', err);
  }
  
  // Browser mode: directly generate and download PDF file to computer
  try {
    const sourceEl = (document.querySelector('#print-preview-content') || document.querySelector('.print-document')) as HTMLElement | null;
    if (sourceEl) {
      // @ts-ignore - html2pdf.js module typing
      const html2pdfModule = await import('html2pdf.js');
      const html2pdf = html2pdfModule.default || html2pdfModule;
      const opt: any = {
        margin: options?.halfPage ? [0, 0, 0, 0] : [4, 4, 4, 4],
        filename: suggested,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: {
          unit: 'mm',
          format: options?.halfPage ? [148.5, 210] : 'a4',
          orientation: 'portrait',
        },
      };
      await (html2pdf() as any).set(opt).from(sourceEl).save();
      return 'saved';
    }
  } catch (err) {
    console.warn('[savePrintPdf] Direct browser PDF generation failed, falling back to print dialog:', err);
  }

  // Fallback if direct download fails
  await triggerPrint(options);
  return 'printed';
}

export function sanitizePdfName(name: string) {
  return name.replace(/[<>:"/\\|?*]+/g, '-').replace(/\s+/g, '_');
}
