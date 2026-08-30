import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDangerous?: boolean;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDangerous = false,
  isLoading = false,
  onConfirm,
  onCancel,
  children
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-[#141b16] border border-[#26332a] w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className={`p-3 rounded-xl ${isDangerous ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-[#c6a052]/10 text-[#c6a052] border border-[#c6a052]/20'}`}>
              <AlertTriangle className="w-6 h-6" />
            </div>
            <button
              onClick={onCancel}
              className="text-[#7ba372] hover:text-white p-1 rounded-lg hover:bg-[#1b241e] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
          <p className="text-sm text-[#a4c29c] leading-relaxed mb-4">{message}</p>

          {children && (
            <div className="my-4">
              {children}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={onCancel}
              disabled={isLoading}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold text-[#a4c29c] hover:text-white bg-[#1b241e] hover:bg-[#222d26] border border-[#26332a] transition-all disabled:opacity-50"
            >
              {cancelText}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isLoading}
              className={`px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg transition-all flex items-center gap-2 disabled:opacity-50 ${
                isDangerous
                  ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-900/30'
                  : 'bg-[#57854d] hover:bg-[#426939] text-white shadow-green-950/40'
              }`}
            >
              {isLoading && (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
