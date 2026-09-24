import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/Button';
import { FileDown, Printer } from 'lucide-react';
import { savePrintPdf, triggerSilentPrint } from '@/lib/printPdf';
import { cn } from '@/lib/utils';

interface PrintPreviewProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'md' | 'lg' | 'xl';
  fileName?: string;
  /** After the preview paints, save a PDF (POS Share PDF / WhatsApp). */
  saveOnOpen?: boolean;
  onSaved?: (result: 'saved' | 'cancelled' | 'printed' | 'error') => void;
  /** Use half-A4 portrait page size for PDF (invoices). */
  halfPage?: boolean;
}

/**
 * Shows an on-screen print preview. Print opens the OS dialog.
 * Save as PDF uses Electron printToPDF, or the print dialog in the browser.
 */
export function PrintPreview({
  open,
  onClose,
  title = 'Print Preview',
  children,
  size = 'xl',
  fileName = 'document.pdf',
  saveOnOpen = false,
  onSaved,
  halfPage = false,
}: PrintPreviewProps) {
  const [saving, setSaving] = useState(false);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const handleSavePdf = async () => {
    setSaving(true);
    try {
      const result = await savePrintPdf(fileName, { halfPage });
      onSavedRef.current?.(result);
    } finally {
      setSaving(false);
    }
  };

  const handleDirectPrint = async () => {
    setSaving(true);
    try {
      await triggerSilentPrint({ halfPage });
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!open || !saveOnOpen) return;
    let cancelled = false;
    const t = window.setTimeout(async () => {
      setSaving(true);
      try {
        const result = await savePrintPdf(fileName, { halfPage });
        if (!cancelled) onSavedRef.current?.(result);
      } finally {
        if (!cancelled) setSaving(false);
      }
    }, 450);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [open, saveOnOpen, fileName, halfPage]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size={size}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            variant="outline"
            icon={<FileDown size={16} />}
            onClick={() => void handleSavePdf()}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save as PDF'}
          </Button>
          <Button
            icon={<Printer size={16} />}
            onClick={() => void handleDirectPrint()}
            disabled={saving}
          >
            {saving ? 'Printing…' : 'Print'}
          </Button>
        </>
      }
    >
      <div
        id="print-preview-content"
        className={cn(
          "print-document max-h-[72vh] overflow-y-auto rounded-xl border border-slate-200/80 bg-slate-100/60 p-2 sm:p-4 flex justify-center print:max-h-none print:overflow-visible print:border-0 print:p-0 print:bg-transparent",
          halfPage ? "half-page-print" : ""
        )}
      >
        {children}
      </div>
    </Modal>
  );
}
