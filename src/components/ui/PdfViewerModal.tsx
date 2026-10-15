import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Download,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Minimize2,
  Printer,
  FileText,
  AlertCircle,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { fetchApi } from '../../lib/api';

export interface PdfViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  pdfUrl?: string | null;
  downloadUrl?: string | null;
  subtitle?: string;
}

export const PdfViewerModal: React.FC<PdfViewerModalProps> = ({
  isOpen,
  onClose,
  title,
  pdfUrl,
  downloadUrl,
  subtitle,
}) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(100);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const activeBlobRef = useRef<string | null>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Load PDF as blob with Authorization token header
  useEffect(() => {
    if (!isOpen || !pdfUrl) {
      if (activeBlobRef.current) {
        URL.revokeObjectURL(activeBlobRef.current);
        activeBlobRef.current = null;
      }
      setBlobUrl(null);
      setLoading(false);
      setError(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);
    setZoom(100);

    const loadPdfBlob = async () => {
      try {
        if (pdfUrl.startsWith('blob:') || pdfUrl.startsWith('data:')) {
          if (isMounted) {
            setBlobUrl(pdfUrl);
            setLoading(false);
          }
          return;
        }

        const res = await fetchApi(pdfUrl);
        if (res.error) {
          throw new Error(res.error);
        }

        // fetchApi in restaurant manager returns JSON or error, or we can fetch directly with auth token
        const { getCurrentAuthToken } = await import('../../lib/firebase');
        const token = await getCurrentAuthToken();
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const rawRes = await fetch(pdfUrl, { headers });
        if (!rawRes.ok) {
          throw new Error(`Failed to load document (${rawRes.status} ${rawRes.statusText})`);
        }

        const blob = await rawRes.blob();
        if (blob.size === 0) {
          throw new Error('Retrieved document is empty or unreadable.');
        }

        const pdfBlob = new Blob([blob], { type: 'application/pdf' });
        const objectUrl = URL.createObjectURL(pdfBlob);

        if (activeBlobRef.current) {
          URL.revokeObjectURL(activeBlobRef.current);
        }
        activeBlobRef.current = objectUrl;

        if (isMounted) {
          setBlobUrl(objectUrl);
          setLoading(false);
        }
      } catch (err: any) {
        console.warn('[PdfViewerModal] Direct blob stream error, trying fallback:', err);
        if (isMounted) {
          if (pdfUrl.startsWith('http://') || pdfUrl.startsWith('https://')) {
            setBlobUrl(pdfUrl);
            setLoading(false);
          } else {
            setError(err?.message || 'Unable to load PDF document.');
            setLoading(false);
          }
        }
      }
    };

    loadPdfBlob();

    return () => {
      isMounted = false;
      if (activeBlobRef.current) {
        URL.revokeObjectURL(activeBlobRef.current);
        activeBlobRef.current = null;
      }
    };
  }, [isOpen, pdfUrl]);

  if (!isOpen) return null;

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 25, 200));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 25, 50));
  const handleResetZoom = () => setZoom(100);

  const handleDownload = () => {
    const targetUrl = blobUrl || downloadUrl || pdfUrl;
    if (!targetUrl) return;

    const safeFilename = `${title.replace(/[^a-zA-Z0-9_-]/g, '_') || 'OlivePizza_Report'}.pdf`;
    const a = document.createElement('a');
    a.href = targetUrl;
    a.download = safeFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handlePrint = () => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      try {
        iframeRef.current.contentWindow.focus();
        iframeRef.current.contentWindow.print();
        return;
      } catch (e) {
        console.warn('[PdfViewerModal] Direct iframe print unavailable, opening print window:', e);
      }
    }
    const targetUrl = blobUrl || pdfUrl;
    if (targetUrl) {
      const printWindow = window.open(targetUrl, '_blank');
      if (printWindow) {
        printWindow.onload = () => printWindow.print();
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className={`bg-[#0d120f] border border-[#26332a] rounded-2xl flex flex-col shadow-2xl overflow-hidden transition-all duration-200 ${
          isFullscreen
            ? 'fixed inset-2 sm:inset-4 w-auto h-auto'
            : 'w-full max-w-5xl h-[88vh] max-h-[900px]'
        }`}
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 bg-[#141b16] border-b border-[#26332a] shrink-0">
          <div className="flex items-center gap-3 min-w-0 pr-2">
            <div className="w-9 h-9 rounded-xl bg-[#57854d]/20 border border-[#57854d]/40 flex items-center justify-center text-[#c6a052] shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-extrabold text-white truncate tracking-tight">
                {title || 'Financial & Operational Report'}
              </h2>
              <p className="text-[11px] text-[#7ba372] truncate">
                {subtitle || 'Olive Pizza Restaurant In-App PDF Preview'}
              </p>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Zoom Controls */}
            <div className="hidden sm:flex items-center bg-[#0d120f] border border-[#26332a] rounded-xl p-1 gap-1">
              <button
                onClick={handleZoomOut}
                disabled={zoom <= 50 || loading || !!error}
                className="p-1.5 text-[#7ba372] hover:text-white hover:bg-[#1a231d] rounded-lg disabled:opacity-40 transition-colors"
                title="Zoom Out (-25%)"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleResetZoom}
                className="px-2 py-1 text-[11px] font-mono font-bold text-[#a4c29c] hover:text-white rounded-lg transition-colors"
                title="Reset Zoom (100%)"
              >
                {zoom}%
              </button>
              <button
                onClick={handleZoomIn}
                disabled={zoom >= 200 || loading || !!error}
                className="p-1.5 text-[#7ba372] hover:text-white hover:bg-[#1a231d] rounded-lg disabled:opacity-40 transition-colors"
                title="Zoom In (+25%)"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              {zoom !== 100 && (
                <button
                  onClick={handleResetZoom}
                  className="p-1.5 text-[#7ba372] hover:text-[#c6a052] hover:bg-[#1a231d] rounded-lg transition-colors"
                  title="Reset to 100%"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Print Button */}
            <button
              onClick={handlePrint}
              disabled={loading || !!error}
              className="p-2 text-[#a4c29c] hover:text-white bg-[#0d120f] hover:bg-[#1a231d] border border-[#26332a] rounded-xl text-xs font-bold transition-all disabled:opacity-40 hidden md:flex items-center gap-1.5"
              title="Print PDF"
            >
              <Printer className="w-4 h-4 text-[#7ba372]" />
              <span className="hidden lg:inline text-[11px]">Print</span>
            </button>

            {/* Direct Download Button */}
            <button
              onClick={handleDownload}
              disabled={loading || !!error}
              className="px-3 py-2 bg-[#57854d] hover:bg-[#486f40] text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-md shadow-green-950/30 disabled:opacity-40"
              title="Download PDF directly"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Download</span>
            </button>

            {/* Fullscreen Toggle */}
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 text-[#a4c29c] hover:text-white bg-[#0d120f] hover:bg-[#1a231d] border border-[#26332a] rounded-xl text-xs transition-colors"
              title={isFullscreen ? 'Exit Fullscreen' : 'View Fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-2 text-[#7ba372] hover:text-white hover:bg-rose-500/20 hover:border-rose-500/30 border border-transparent rounded-xl transition-all ml-1"
              title="Close Viewer (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 bg-[#070b08] relative overflow-auto flex items-center justify-center p-2 sm:p-4">
          {loading && (
            <div className="flex flex-col items-center justify-center gap-3 text-center p-8">
              <div className="relative">
                <div className="w-12 h-12 rounded-full border-3 border-[#57854d]/20 border-t-[#57854d] animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-[#c6a052] animate-pulse" />
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-white">Streaming Statement from Cloudflare R2...</p>
                <p className="text-xs text-[#7ba372]">Decrypting restaurant monthly audit PDF</p>
              </div>
            </div>
          )}

          {error && !loading && (
            <div className="max-w-md p-6 bg-[#141b16] border border-red-500/30 rounded-2xl text-center space-y-4">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-extrabold text-white">Document Preview Unavailable</h3>
                <p className="text-xs text-red-300">{error}</p>
              </div>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
                <button
                  onClick={() => {
                    setError(null);
                    setLoading(true);
                    if (pdfUrl) {
                      window.location.reload();
                    }
                  }}
                  className="px-4 py-2 bg-[#57854d] hover:bg-[#486f40] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Retry Loading
                </button>
                {pdfUrl && (
                  <a
                    href={pdfUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-4 py-2 bg-[#0d120f] hover:bg-[#1a231d] border border-[#26332a] text-[#a4c29c] rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Open in New Tab
                  </a>
                )}
              </div>
            </div>
          )}

          {!loading && !error && blobUrl && (
            <div
              className="w-full h-full flex items-start justify-center overflow-auto transition-transform duration-150 origin-top"
              style={{
                transform: zoom !== 100 ? `scale(${zoom / 100})` : undefined,
                transformOrigin: 'top center',
              }}
            >
              <iframe
                ref={iframeRef}
                src={`${blobUrl}#toolbar=0&navpanes=0&scrollbar=1`}
                title={title || 'PDF Document Viewer'}
                className="w-full h-full rounded-xl border-0 shadow-lg bg-[#0d120f]"
              />
            </div>
          )}
        </div>

        {/* Footer Bar */}
        <div className="px-4 py-2 bg-[#141b16] border-t border-[#26332a] flex items-center justify-between text-[11px] text-[#7ba372] shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>Cloudflare R2 Object Storage</span>
          </div>
          <div className="flex items-center gap-3">
            <span>Scroll with mouse wheel or trackpad</span>
            <span className="hidden sm:inline">• Press Esc to exit</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PdfViewerModal;
