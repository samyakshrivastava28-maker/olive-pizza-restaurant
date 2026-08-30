import React, { useState } from 'react';
import { 
  Mail, 
  Send, 
  History, 
  CheckCircle2, 
  AlertCircle, 
  FileText,
  UserCheck
} from 'lucide-react';
import { useManagerStore } from '../store/managerStore';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

export const EmailPage: React.FC = () => {
  const { 
    emailHistory, 
    sendEmail, 
    activeBranchName 
  } = useManagerStore();

  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [template, setTemplate] = useState('operational_notice');
  const [isSending, setIsSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipient.trim() || !subject.trim() || !message.trim()) {
      toast.error('Recipient, subject, and message are required');
      return;
    }

    setIsSending(true);
    const success = await sendEmail({
      recipient: recipient.trim(),
      subject: subject.trim(),
      message: message.trim(),
      template
    });
    setIsSending(false);

    if (success) {
      toast.success('Operational email dispatched via backend SMTP');
      setRecipient('');
      setSubject('');
      setMessage('');
    } else {
      toast.error('Failed to send email');
    }
  };

  const handleApplyTemplate = (tmpl: string) => {
    setTemplate(tmpl);
    if (tmpl === 'order_delay') {
      setSubject(`Order Delay Update — ${activeBranchName}`);
      setMessage('We apologize for a slight delay in preparing your artisan pizza order due to peak rush hour. Our chefs are crafting it with care, and it will be dispatched shortly.');
    } else if (tmpl === 'special_hours') {
      setSubject(`Special Operating Hours Update — ${activeBranchName}`);
      setMessage(`Please be advised that Olive Pizza (${activeBranchName}) will be operating under modified holiday schedules today. Thank you for your continuous love and support.`);
    } else if (tmpl === 'custom') {
      setSubject('');
      setMessage('');
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
          <Mail className="w-6 h-6 text-[#c6a052]" />
          Operational Email Dispatcher
        </h1>
        <p className="text-xs text-[#a4c29c] mt-0.5">
          Send verified restaurant communications and customer service emails from {activeBranchName}.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Email Form */}
        <div className="lg:col-span-7 p-6 rounded-2xl bg-[#141b16] border border-[#26332a] shadow-lg space-y-4">
          <h2 className="text-sm font-bold text-white flex items-center gap-2 border-b border-[#26332a] pb-3">
            <Send className="w-4 h-4 text-[#57854d]" /> Compose Email
          </h2>

          {/* Quick Template Buttons */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#a4c29c] block">Preset Templates</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'custom', label: 'Custom' },
                { id: 'order_delay', label: 'Order Delay' },
                { id: 'special_hours', label: 'Special Hours' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleApplyTemplate(t.id)}
                  className={`p-2 rounded-xl text-xs font-bold border transition-all text-center ${
                    template === t.id
                      ? 'bg-[#57854d]/20 border-[#57854d] text-white'
                      : 'bg-[#0d120f] border-[#26332a] text-[#a4c29c] hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Recipient */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#a4c29c] flex items-center gap-1">
                <UserCheck className="w-3.5 h-3.5 text-[#7ba372]" /> Recipient Email Address
              </label>
              <input
                type="email"
                placeholder="customer@example.com or staff@olivepizza.in"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0d120f] border border-[#26332a] text-xs text-white placeholder-[#7ba372]/60 focus:outline-none focus:border-[#c6a052]"
              />
            </div>

            {/* Subject */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#a4c29c] flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-[#7ba372]" /> Subject Line
              </label>
              <input
                type="text"
                placeholder="e.g. Olive Pizza Order Update"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0d120f] border border-[#26332a] text-xs text-white placeholder-[#7ba372]/60 focus:outline-none focus:border-[#c6a052]"
              />
            </div>

            {/* Message Body */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#a4c29c] block">Email Content</label>
              <textarea
                placeholder="Type your message here..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0d120f] border border-[#26332a] text-xs text-white placeholder-[#7ba372]/60 focus:outline-none focus:border-[#c6a052] resize-none font-sans"
              />
            </div>

            <button
              type="submit"
              disabled={isSending}
              className="w-full py-3 rounded-xl bg-[#57854d] hover:bg-[#426939] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-green-950/40 transition-all disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              <span>{isSending ? 'Sending Email via Backend...' : 'Send Operational Email'}</span>
            </button>
          </form>
        </div>

        {/* Right: Email History */}
        <div className="lg:col-span-5 p-6 rounded-2xl bg-[#141b16] border border-[#26332a] shadow-lg flex flex-col justify-between space-y-4">
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2 border-b border-[#26332a] pb-3 mb-3">
              <History className="w-4 h-4 text-[#c6a052]" /> Sent Email History
            </h2>

            <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
              {emailHistory.length > 0 ? (
                emailHistory.map((em) => (
                  <div key={em.id} className="p-3 rounded-xl bg-[#0d120f] border border-[#26332a] space-y-1 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <strong className="text-white font-bold block truncate">{em.subject}</strong>
                      <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-[#10b981]/20 text-[#10b981] shrink-0">
                        {em.status}
                      </span>
                    </div>
                    <p className="text-[#a4c29c] text-[11px] truncate">To: {em.recipients}</p>
                    <div className="flex items-center justify-between text-[10px] text-[#7ba372] pt-1">
                      <span>{em.sentAt ? format(new Date(em.sentAt), 'dd MMM, HH:mm') : 'Just now'}</span>
                      <span className="flex items-center gap-1 text-[#10b981]">
                        <CheckCircle2 className="w-3 h-3" /> Sent
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-[#7ba372] italic p-4 text-center">
                  No emails sent yet in this session.
                </p>
              )}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#0d120f] border border-[#26332a]/60 text-[11px] text-[#7ba372] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-[#c6a052] shrink-0" />
            <span>Emails are sent using the centralized verified SMTP service. No credentials stored on client.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
