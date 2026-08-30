import React from 'react';
import { Save, RotateCcw, AlertCircle } from 'lucide-react';

interface UnsavedPromptProps {
  show: boolean;
  isSaving?: boolean;
  onSave: () => void;
  onReset: () => void;
}

export const UnsavedPrompt: React.FC<UnsavedPromptProps> = ({
  show,
  isSaving = false,
  onSave,
  onReset
}) => {
  if (!show) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[90%] max-w-2xl bg-[#141b16]/95 border border-[#c6a052]/40 rounded-2xl shadow-2xl backdrop-blur-md p-4 animate-in slide-in-from-bottom-5 duration-200">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[#c6a052]/20 text-[#c6a052] border border-[#c6a052]/30">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white">You have unsaved changes</h4>
            <p className="text-xs text-[#a4c29c]">Save your changes to apply updates to restaurant operations.</p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            type="button"
            onClick={onReset}
            disabled={isSaving}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold text-[#a4c29c] hover:text-white bg-[#1b241e] hover:bg-[#222d26] border border-[#26332a] transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Discard
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving}
            className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-[#57854d] hover:bg-[#426939] shadow-lg shadow-green-950/50 transition-all flex items-center gap-1.5 disabled:opacity-50"
          >
            {isSaving ? (
              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};
