import React, { useState } from 'react';
import { 
  Bell, 
  Send, 
  Users, 
  Bike, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  History,
  Image as ImageIcon,
  Link2
} from 'lucide-react';
import { useManagerStore } from '../store/managerStore';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

export const NotificationsPage: React.FC = () => {
  const { 
    notificationHistory, 
    sendNotification, 
    activeBranchName 
  } = useManagerStore();

  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [targetAudience, setTargetAudience] = useState<'customers' | 'staff' | 'delivery' | 'all'>('customers');
  const [imageUrl, setImageUrl] = useState('');
  const [deepLink, setDeepLink] = useState('');
  const [isSending, setIsSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) {
      toast.error('Title and message are required');
      return;
    }

    setIsSending(true);
    const success = await sendNotification({
      title: title.trim(),
      message: message.trim(),
      targetAudience,
      imageUrl: imageUrl.trim() || undefined,
      deepLink: deepLink.trim() || undefined
    });
    setIsSending(false);

    if (success) {
      toast.success('Operational notification dispatched via FCM');
      setTitle('');
      setMessage('');
      setImageUrl('');
      setDeepLink('');
    } else {
      toast.error('Failed to dispatch notification');
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
          <Bell className="w-6 h-6 text-[#c6a052]" />
          Restaurant Notifications & Broadcasts
        </h1>
        <p className="text-xs text-[#a4c29c] mt-0.5">
          Dispatch operational push notifications to customers, kitchen staff, or delivery partners for {activeBranchName}.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Form */}
        <div className="lg:col-span-7 p-6 rounded-2xl bg-[#141b16] border border-[#26332a] shadow-lg space-y-4">
          <h2 className="text-sm font-bold text-white flex items-center gap-2 border-b border-[#26332a] pb-3">
            <Send className="w-4 h-4 text-[#57854d]" /> Compose Operational Broadcast
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Target Audience Picker */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#a4c29c] block">Target Audience</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'customers', label: 'Customers', icon: Users },
                  { id: 'staff', label: 'Kitchen & Staff', icon: Sparkles },
                  { id: 'delivery', label: 'Delivery Riders', icon: Bike },
                ].map((aud) => (
                  <button
                    key={aud.id}
                    type="button"
                    onClick={() => setTargetAudience(aud.id as any)}
                    className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition-all ${
                      targetAudience === aud.id
                        ? 'bg-[#57854d]/20 border-[#57854d] text-white shadow-sm'
                        : 'bg-[#0d120f] border-[#26332a] text-[#a4c29c] hover:text-white'
                    }`}
                  >
                    <aud.icon className={`w-4 h-4 ${targetAudience === aud.id ? 'text-[#c6a052]' : 'text-[#7ba372]'}`} />
                    <span>{aud.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Notification Title */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#a4c29c] block">Notification Title</label>
              <input
                type="text"
                placeholder="e.g. Fresh Hot Pizzas Ready, Kitchen Alert, Rush Hour Update"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={65}
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0d120f] border border-[#26332a] text-xs text-white placeholder-[#7ba372]/60 focus:outline-none focus:border-[#c6a052]"
              />
              <span className="text-[10px] text-[#7ba372] block text-right">{title.length}/65 characters</span>
            </div>

            {/* Message Body */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#a4c29c] block">Message Body</label>
              <textarea
                placeholder="Enter detailed message text to display in the push notification..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                maxLength={200}
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0d120f] border border-[#26332a] text-xs text-white placeholder-[#7ba372]/60 focus:outline-none focus:border-[#c6a052] resize-none"
              />
              <span className="text-[10px] text-[#7ba372] block text-right">{message.length}/200 characters</span>
            </div>

            {/* Optional Image URL */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#a4c29c] flex items-center gap-1">
                <ImageIcon className="w-3.5 h-3.5 text-[#7ba372]" /> Optional Image URL
              </label>
              <input
                type="url"
                placeholder="https://res.cloudinary.com/... or https://..."
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-[#0d120f] border border-[#26332a] text-xs text-white placeholder-[#7ba372]/60 focus:outline-none focus:border-[#c6a052]"
              />
            </div>

            {/* Optional Deep Link */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#a4c29c] flex items-center gap-1">
                <Link2 className="w-3.5 h-3.5 text-[#7ba372]" /> Action Link / Route (Optional)
              </label>
              <input
                type="text"
                placeholder="/menu, /orders/live, /delivery"
                value={deepLink}
                onChange={(e) => setDeepLink(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-[#0d120f] border border-[#26332a] text-xs text-white placeholder-[#7ba372]/60 focus:outline-none focus:border-[#c6a052]"
              />
            </div>

            <button
              type="submit"
              disabled={isSending}
              className="w-full py-3 rounded-xl bg-[#57854d] hover:bg-[#426939] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-green-950/40 transition-all disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              <span>{isSending ? 'Sending Broadcast via FCM...' : 'Send Push Notification'}</span>
            </button>
          </form>
        </div>

        {/* Right: Notification History */}
        <div className="lg:col-span-5 p-6 rounded-2xl bg-[#141b16] border border-[#26332a] shadow-lg flex flex-col justify-between space-y-4">
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2 border-b border-[#26332a] pb-3 mb-3">
              <History className="w-4 h-4 text-[#c6a052]" /> Recent Broadcasts
            </h2>

            <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
              {notificationHistory.length > 0 ? (
                notificationHistory.map((n) => (
                  <div key={n.id} className="p-3 rounded-xl bg-[#0d120f] border border-[#26332a] space-y-1 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <strong className="text-white font-bold block">{n.title}</strong>
                      <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-[#57854d]/20 text-[#57854d] shrink-0">
                        {n.targetAudience}
                      </span>
                    </div>
                    <p className="text-[#a4c29c] text-[11px] line-clamp-2">{n.message}</p>
                    <div className="flex items-center justify-between text-[10px] text-[#7ba372] pt-1">
                      <span>{n.sentAt ? format(new Date(n.sentAt), 'dd MMM, HH:mm') : 'Just now'}</span>
                      <span className="flex items-center gap-1 text-[#10b981]">
                        <CheckCircle2 className="w-3 h-3" /> Dispatched
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-[#7ba372] italic p-4 text-center">
                  No notifications sent yet in this session.
                </p>
              )}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#0d120f] border border-[#26332a]/60 text-[11px] text-[#7ba372] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-[#c6a052] shrink-0" />
            <span>FCM messages route through the central Olive Pizza notification engine.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
