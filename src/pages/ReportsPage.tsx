import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileText,
  FileSpreadsheet,
  Download,
  Eye,
  Calendar,
  Clock,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Building2,
  Filter,
  Sparkles,
} from 'lucide-react';
import { useManagerStore } from '../store/managerStore';
import { fetchApi } from '../lib/api';
import toast from 'react-hot-toast';
import { PdfViewerModal } from '../components/ui/PdfViewerModal';

export type TimeRangeFilter =
  | 'Ongoing Month'
  | 'Previous Month'
  | 'This Week'
  | 'Previous Week'
  | 'Last Day'
  | 'Last 2 Days'
  | 'All Time';

const TIME_RANGES: TimeRangeFilter[] = [
  'Ongoing Month',
  'Previous Month',
  'This Week',
  'Previous Week',
  'Last Day',
  'Last 2 Days',
  'All Time',
];

function parseTimestamp(val: any): Date {
  if (!val) return new Date();
  if (val instanceof Date) return val;
  if (typeof val.toDate === 'function') return val.toDate();
  if (typeof val === 'object' && val._seconds) return new Date(val._seconds * 1000);
  if (typeof val === 'number') return new Date(val);
  const d = new Date(val);
  return isNaN(d.getTime()) ? new Date() : d;
}

export const ReportsPage: React.FC = () => {
  const { activeBranchId, activeBranchName, userRole, managerProfile, liveOrders, historicalOrders } = useManagerStore();

  const isOwner =
    userRole === 'owner' ||
    userRole === 'admin' ||
    managerProfile?.email === 'olivepizzarjn@gmail.com' ||
    managerProfile?.email === 'webhub2811@gmail.com';

  const [monthlyReports, setMonthlyReports] = useState<any[]>([]);
  const [loadingReports, setLoadingReports] = useState<boolean>(true);
  const [customTimeRange, setCustomTimeRange] = useState<TimeRangeFilter>('Ongoing Month');
  const [generatingCustomPdf, setGeneratingCustomPdf] = useState<boolean>(false);

  // Quota State
  const [quota, setQuota] = useState<{
    remaining: number;
    limit: number | string;
    usedThisHour: number;
    resetInMinutes: number;
    isOwner: boolean;
  }>({
    remaining: 2,
    limit: 2,
    usedThisHour: 0,
    resetInMinutes: 60,
    isOwner: false,
  });
  const [loadingQuota, setLoadingQuota] = useState<boolean>(true);

  // In-App PDF Viewer Modal State
  const [pdfModal, setPdfModal] = useState<{
    isOpen: boolean;
    title: string;
    pdfUrl: string;
    downloadUrl?: string;
    subtitle?: string;
  }>({
    isOpen: false,
    title: '',
    pdfUrl: '',
  });

  const openPdfViewer = (title: string, pdfUrl: string, downloadUrl?: string, subtitle?: string) => {
    setPdfModal({
      isOpen: true,
      title,
      pdfUrl,
      downloadUrl: downloadUrl || `${pdfUrl}?download=true`,
      subtitle,
    });
  };

  // 1. Fetch Quota from `/api/reports/quota`
  const fetchQuota = useCallback(async () => {
    setLoadingQuota(true);
    try {
      const res = await fetchApi(`/api/reports/quota?branchId=${encodeURIComponent(activeBranchId || 'main_branch')}`);
      if (res && res.success) {
        setQuota({
          remaining: res.remaining ?? 2,
          limit: res.limit ?? 2,
          usedThisHour: res.usedThisHour ?? 0,
          resetInMinutes: res.resetInMinutes ?? 60,
          isOwner: !!res.isOwner || isOwner,
        });
      } else if (isOwner) {
        setQuota({
          remaining: 9999,
          limit: 'unlimited',
          usedThisHour: 0,
          resetInMinutes: 0,
          isOwner: true,
        });
      }
    } catch (e) {
      console.warn('[ReportsPage] Quota fetch notice:', e);
    } finally {
      setLoadingQuota(false);
    }
  }, [activeBranchId, isOwner]);

  // 2. Fetch Monthly Reports saved in Cloudflare R2 for this branch
  const fetchMonthlyReports = useCallback(async () => {
    setLoadingReports(true);
    try {
      const query = activeBranchId ? `?branchId=${encodeURIComponent(activeBranchId)}` : '';
      const res = await fetchApi(`/api/reports/monthly${query}`);
      if (Array.isArray(res)) {
        setMonthlyReports(res);
      } else if (res && Array.isArray(res.reports)) {
        setMonthlyReports(res.reports);
      } else {
        setMonthlyReports([]);
      }
    } catch (err) {
      console.warn('[ReportsPage] Reports list fetch fallback:', err);
    } finally {
      setLoadingReports(false);
    }
  }, [activeBranchId]);

  useEffect(() => {
    fetchQuota();
    fetchMonthlyReports();
  }, [fetchQuota, fetchMonthlyReports]);

  // All restaurant orders for local custom metrics computation
  const allOrders = useMemo(() => {
    return [...(liveOrders || []), ...(historicalOrders || [])];
  }, [liveOrders, historicalOrders]);

  // Filter orders by the selected custom time range
  const customFilteredOrders = useMemo(() => {
    const now = new Date();
    const nowMs = now.getTime();

    return allOrders.filter((o) => {
      const t = parseTimestamp(o.createdAt).getTime();

      switch (customTimeRange) {
        case 'Ongoing Month': {
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
          return t >= startOfMonth;
        }
        case 'Previous Month': {
          const startOfLast = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
          const endOfLast = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
          return t >= startOfLast && t < endOfLast;
        }
        case 'This Week': {
          const day = now.getDay();
          const diff = now.getDate() - day + (day === 0 ? -6 : 1);
          const startOfWeek = new Date(now.getFullYear(), now.getMonth(), diff).setHours(0, 0, 0, 0);
          return t >= startOfWeek;
        }
        case 'Previous Week': {
          const day = now.getDay();
          const diff = now.getDate() - day + (day === 0 ? -6 : 1) - 7;
          const startOfPrevWeek = new Date(now.getFullYear(), now.getMonth(), diff).setHours(0, 0, 0, 0);
          const endOfPrevWeek = startOfPrevWeek + 7 * 24 * 60 * 60 * 1000;
          return t >= startOfPrevWeek && t < endOfPrevWeek;
        }
        case 'Last Day': {
          const oneDayAgo = nowMs - 24 * 60 * 60 * 1000;
          return t >= oneDayAgo;
        }
        case 'Last 2 Days': {
          const twoDaysAgo = nowMs - 48 * 60 * 60 * 1000;
          return t >= twoDaysAgo;
        }
        case 'All Time':
        default:
          return true;
      }
    });
  }, [allOrders, customTimeRange]);

  // Aggregate metrics for custom range
  const customStats = useMemo(() => {
    let revenue = 0;
    let completed = 0;
    let cashTotal = 0;
    let upiTotal = 0;

    customFilteredOrders.forEach((o) => {
      const s = (o.status || 'pending').toLowerCase();
      const amt = Number(o.totalAmount ?? (o as any).total ?? (o as any).finalAmount ?? 0);

      if (s !== 'cancelled' && s !== 'rejected') {
        revenue += amt;
        const pm = (o.paymentMethod || (o as any).payment?.method || 'CASH').toUpperCase();
        if (pm.includes('CASH') || pm.includes('COD')) cashTotal += amt;
        else upiTotal += amt;
      }
      if (s === 'delivered' || s === 'completed') completed++;
    });

    const aov = customFilteredOrders.length > 0 ? Math.round(revenue / Math.max(1, customFilteredOrders.length)) : 0;

    return {
      revenue,
      totalOrders: customFilteredOrders.length,
      completed,
      cashTotal,
      upiTotal,
      aov,
    };
  }, [customFilteredOrders]);

  // Generate Custom Report Handler
  const handleGenerateCustomPdf = async (action: 'preview' | 'download' = 'preview') => {
    if (!isOwner && quota.remaining <= 0) {
      toast.error(`Hourly limit reached (${quota.usedThisHour}/${quota.limit} used). Resets in ${quota.resetInMinutes}m.`, {
        duration: 4000,
        icon: '⚠️',
      });
      return;
    }

    setGeneratingCustomPdf(true);
    const toastId = toast.loading(`Generating official ${customTimeRange} statement...`);

    try {
      const res = await fetchApi('/api/reports/generate-custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timeRange: customTimeRange,
          branchId: activeBranchId || 'main_branch',
          branchName: activeBranchName || 'Olive Pizza Restaurant',
        }),
      });

      if (res && res.success && res.report) {
        toast.success(`Custom ${customTimeRange} PDF ready!`, { id: toastId });
        const viewUrl = res.report.viewUrl || res.report.pdfUrl;
        const downloadUrl = res.report.downloadUrl || `${viewUrl}?download=true`;

        // Update quota count
        fetchQuota();
        fetchMonthlyReports();

        if (action === 'download') {
          const a = document.createElement('a');
          a.href = downloadUrl;
          a.download = `OlivePizza_${customTimeRange.replace(/\s+/g, '_')}_Report.pdf`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } else {
          openPdfViewer(
            `Custom Statement — ${customTimeRange}`,
            viewUrl,
            downloadUrl,
            `Restaurant: ${activeBranchName || 'Assigned Branch'} • Generated On-Demand`
          );
        }
      } else {
        toast.error(res?.error || 'Failed to generate custom report', { id: toastId });
      }
    } catch (err: any) {
      toast.error('Failed to generate PDF: ' + err.message, { id: toastId });
    } finally {
      setGeneratingCustomPdf(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-[#0d120f] border border-[#26332a] rounded-2xl shadow-lg">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-extrabold text-white tracking-tight">Restaurant Financial & Sales Reports</h1>
            <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-[#57854d]/20 border border-[#57854d]/40 text-[#c6a052]">
              <Sparkles className="w-3 h-3" /> Realtime Cloudflare R2
            </span>
          </div>
          <p className="text-xs text-[#7ba372] mt-0.5">
            Authoritative balance sheets, tax breakdown, and encrypted monthly audit statements for {activeBranchName || 'this branch'}.
          </p>
        </div>

        {/* Live Quota Badge & Refresh */}
        <div className="flex items-center gap-3">
          {/* Quota Badge */}
          <div
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-bold transition-all ${
              quota.isOwner || isOwner
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : quota.remaining > 0
                ? 'bg-[#57854d]/15 border-[#57854d]/40 text-[#a4c29c]'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
            }`}
            title="Hourly custom PDF generation quota"
          >
            {quota.isOwner || isOwner ? (
              <>
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Owner Unlimited Downloads</span>
              </>
            ) : loadingQuota ? (
              <>
                <Clock className="w-4 h-4 text-[#c6a052] shrink-0 animate-spin" />
                <span>Checking quota...</span>
              </>
            ) : (
              <>
                <Clock className="w-4 h-4 text-[#c6a052] shrink-0" />
                <span>
                  {quota.remaining}/{quota.limit} custom PDFs remaining this hour
                </span>
                {quota.remaining === 0 && (
                  <span className="text-[10px] bg-amber-500/20 px-1.5 py-0.5 rounded text-amber-300">
                    resets in {quota.resetInMinutes}m
                  </span>
                )}
              </>
            )}
          </div>

          {/* Refresh Button */}
          <button
            onClick={() => {
              fetchQuota();
              fetchMonthlyReports();
            }}
            disabled={loadingReports || loadingQuota}
            className="p-2.5 bg-[#141b16] hover:bg-[#1e2720] border border-[#26332a] text-[#a4c29c] hover:text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
            title="Refresh reports and quota"
          >
            <RefreshCw className={`w-4 h-4 ${loadingReports || loadingQuota ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* SECTION B: CUSTOM REPORTS (WITH 7 TIME FILTERS & LIVE QUOTA ENFORCEMENT) */}
      <section className="bg-[#0d120f] border border-[#26332a] rounded-2xl p-6 shadow-md space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#26332a] pb-4">
          <div>
            <h2 className="text-sm font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
              <Filter className="w-4 h-4 text-[#c6a052]" />
              <span>Section B: Custom Sales Reports & Time Filters</span>
            </h2>
            <p className="text-xs text-[#7ba372] mt-0.5">
              Select any time window to preview metrics and export an official PDF audit statement.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-[#a4c29c]">
              Branch: <strong className="text-white">{activeBranchName || 'Assigned Branch'}</strong>
            </span>
          </div>
        </div>

        {/* 7 Time Filters Selection Buttons */}
        <div className="space-y-2">
          <label className="text-[11px] font-bold text-[#7ba372] uppercase tracking-wider block">
            Select Time Range:
          </label>
          <div className="flex flex-wrap gap-2">
            {TIME_RANGES.map((range) => {
              const isSelected = customTimeRange === range;
              return (
                <button
                  key={range}
                  onClick={() => setCustomTimeRange(range)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-[#57854d] text-white shadow-lg shadow-green-950/40 ring-2 ring-[#57854d]/50'
                      : 'bg-[#141b16] hover:bg-[#1a231d] text-[#a4c29c] border border-[#26332a] hover:text-white'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5 text-[#c6a052]" />
                  <span>{range}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Preview Metrics for Selected Filter */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
          <div className="bg-[#141b16] border border-[#26332a] rounded-xl p-4">
            <span className="text-[10px] font-bold text-[#7ba372] uppercase block">Selected Range Gross</span>
            <span className="text-xl font-black text-white font-mono mt-1 block">
              ₹{customStats.revenue.toLocaleString('en-IN')}
            </span>
            <span className="text-[10px] text-[#c6a052] mt-0.5 block">{customTimeRange}</span>
          </div>

          <div className="bg-[#141b16] border border-[#26332a] rounded-xl p-4">
            <span className="text-[10px] font-bold text-[#7ba372] uppercase block">Total Bills</span>
            <span className="text-xl font-black text-white font-mono mt-1 block">
              {customStats.totalOrders}
            </span>
            <span className="text-[10px] text-[#7ba372] mt-0.5 block">{customStats.completed} completed</span>
          </div>

          <div className="bg-[#141b16] border border-[#26332a] rounded-xl p-4">
            <span className="text-[10px] font-bold text-[#7ba372] uppercase block">UPI / QR Collections</span>
            <span className="text-xl font-black text-emerald-400 font-mono mt-1 block">
              ₹{customStats.upiTotal.toLocaleString('en-IN')}
            </span>
            <span className="text-[10px] text-[#7ba372] mt-0.5 block">Digital settlement</span>
          </div>

          <div className="bg-[#141b16] border border-[#26332a] rounded-xl p-4">
            <span className="text-[10px] font-bold text-[#7ba372] uppercase block">Average Ticket Size</span>
            <span className="text-xl font-black text-[#c6a052] font-mono mt-1 block">
              ₹{customStats.aov}
            </span>
            <span className="text-[10px] text-[#7ba372] mt-0.5 block">Per processed order</span>
          </div>
        </div>

        {/* Action Bar: Quota Warning & Export Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-[#141b16] rounded-xl border border-[#26332a]">
          <div className="text-xs text-[#a4c29c]">
            {quota.isOwner || isOwner ? (
              <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> Unlimited custom PDF generation enabled
              </span>
            ) : quota.remaining > 0 ? (
              <span>
                You have <strong className="text-white">{quota.remaining}</strong> custom generation request
                {quota.remaining === 1 ? '' : 's'} remaining this hour.
              </span>
            ) : (
              <span className="text-amber-400 font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                Hourly quota reached (2/2 used). Resets in {quota.resetInMinutes} minutes.
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              onClick={() => handleGenerateCustomPdf('preview')}
              disabled={generatingCustomPdf || (!isOwner && quota.remaining <= 0)}
              className="flex-1 sm:flex-none px-4 py-2.5 bg-[#1b241e] hover:bg-[#26332a] border border-[#26332a] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5 text-blue-400" />
              <span>Preview PDF in App</span>
            </button>

            <button
              onClick={() => handleGenerateCustomPdf('download')}
              disabled={generatingCustomPdf || (!isOwner && quota.remaining <= 0)}
              className="flex-1 sm:flex-none px-4 py-2.5 bg-[#57854d] hover:bg-[#486f40] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-md shadow-green-950/40 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Custom PDF</span>
            </button>
          </div>
        </div>
      </section>

      {/* SECTION A: ALL-TIME MONTHLY REPORTS (CLOUDFLARE R2) */}
      <section className="bg-[#0d120f] border border-[#26332a] rounded-2xl p-6 shadow-md space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#26332a] pb-4">
          <div>
            <h2 className="text-sm font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>Section A: All-Time Monthly Reports Archive (Cloudflare R2)</span>
            </h2>
            <p className="text-xs text-[#7ba372] mt-0.5">
              Official monthly balance sheets and tax ledgers archived in encrypted Cloudflare R2 object storage.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-[#c6a052]">
              {monthlyReports.length} {monthlyReports.length === 1 ? 'Statement' : 'Statements'}
            </span>
          </div>
        </div>

        {loadingReports ? (
          <div className="text-center py-12 space-y-3">
            <div className="w-8 h-8 rounded-full border-2 border-[#57854d] border-t-transparent animate-spin mx-auto" />
            <p className="text-xs text-[#a4c29c]">Loading Cloudflare R2 monthly statements...</p>
          </div>
        ) : monthlyReports.length === 0 ? (
          <div className="text-center py-14 text-[#7ba372] space-y-3">
            <FileText className="w-12 h-12 mx-auto text-[#26332a] opacity-60" />
            <p className="text-sm font-bold text-white">No monthly PDF statements found for this restaurant.</p>
            <p className="text-xs text-[#7ba372] max-w-sm mx-auto">
              Monthly reports are automatically finalized on the 1st of every month at 00:05 AM IST, or generated on-demand by the Owner.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {monthlyReports.map((r: any, idx: number) => {
              const viewLink = r.viewUrl || r.reportUrl || `/api/reports/monthly/${r.id}/view`;
              const downloadLink = r.downloadUrl || `${viewLink}?download=true`;
              const revenue = Number(r.revenue || 0);
              const ordersCount = Number(r.orders || 0);
              const aov = r.averageOrderValue
                ? Math.round(r.averageOrderValue)
                : ordersCount > 0
                ? Math.round(revenue / ordersCount)
                : 0;

              return (
                <div
                  key={r.id || idx}
                  className="p-5 bg-[#141b16] hover:bg-[#18211b] rounded-2xl border border-[#26332a] transition-all flex flex-col justify-between space-y-4 shadow-sm"
                >
                  <div className="space-y-3">
                    {/* Top Row: Period & Audited Status */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="px-3 py-1 bg-[#57854d]/20 border border-[#57854d]/40 text-[#c6a052] rounded-full text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{r.period || `${r.month || ''} ${r.year || ''}`}</span>
                      </span>

                      <span className="px-2.5 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full text-[11px] font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Audited & Sealed
                      </span>
                    </div>

                    {/* Restaurant Branch & Cloudflare R2 Identity */}
                    <div>
                      <h3 className="text-sm font-extrabold text-white flex items-center gap-1.5">
                        <Building2 className="w-4 h-4 text-[#c6a052] shrink-0" />
                        <span>{r.branchName || r.title || `Olive Pizza — ${r.branchId || activeBranchName}`}</span>
                      </h3>
                      <div className="text-[11px] text-[#7ba372] mt-0.5">
                        {r.franchiseName || 'Olive Pizza Franchise'} • {r.pdfSize || 'Cloudflare R2 Encrypted'}
                      </div>
                    </div>

                    {/* Financial Metrics Strip */}
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#26332a]">
                      <div className="bg-[#0d120f] p-2.5 rounded-xl border border-[#26332a]/60">
                        <span className="text-[10px] font-bold text-[#7ba372] uppercase block">Gross Sales</span>
                        <span className="text-sm font-black text-emerald-400 font-mono mt-0.5 block">
                          ₹{revenue.toLocaleString('en-IN')}
                        </span>
                      </div>
                      <div className="bg-[#0d120f] p-2.5 rounded-xl border border-[#26332a]/60">
                        <span className="text-[10px] font-bold text-[#7ba372] uppercase block">Total Orders</span>
                        <span className="text-sm font-black text-white font-mono mt-0.5 block">
                          {ordersCount}
                        </span>
                      </div>
                      <div className="bg-[#0d120f] p-2.5 rounded-xl border border-[#26332a]/60">
                        <span className="text-[10px] font-bold text-[#7ba372] uppercase block">Avg Ticket</span>
                        <span className="text-sm font-black text-[#c6a052] font-mono mt-0.5 block">
                          ₹{aov}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions: View in In-App Modal & Direct Download */}
                  <div className="flex items-center gap-2 pt-2 border-t border-[#26332a]/80">
                    <button
                      onClick={() =>
                        openPdfViewer(
                          r.title || `${r.month || ''} ${r.year || ''} Monthly Audit Statement`,
                          viewLink,
                          downloadLink,
                          `Restaurant: ${r.branchName || activeBranchName} • Cloudflare R2`
                        )
                      }
                      className="flex-1 py-2 px-3 bg-[#1b241e] hover:bg-[#26332a] border border-[#26332a] text-[#a4c29c] hover:text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5 text-blue-400" />
                      <span>View PDF</span>
                    </button>

                    <a
                      href={downloadLink}
                      download
                      className="flex-1 py-2 px-3 bg-[#57854d] hover:bg-[#486f40] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-md shadow-green-950/30"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download PDF</span>
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* In-App PDF Viewer Modal */}
      <PdfViewerModal
        isOpen={pdfModal.isOpen}
        onClose={() => setPdfModal((prev) => ({ ...prev, isOpen: false }))}
        title={pdfModal.title}
        pdfUrl={pdfModal.pdfUrl}
        downloadUrl={pdfModal.downloadUrl}
        subtitle={pdfModal.subtitle}
      />
    </div>
  );
};

export default ReportsPage;
