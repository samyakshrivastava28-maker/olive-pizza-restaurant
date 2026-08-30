import React from 'react';

interface StatusToggleProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  activeColor?: 'green' | 'amber' | 'red' | 'gold';
  badge?: string;
}

export const StatusToggle: React.FC<StatusToggleProps> = ({
  label,
  description,
  checked,
  onChange,
  disabled = false,
  activeColor = 'green',
  badge
}) => {
  const getActiveClass = () => {
    switch (activeColor) {
      case 'amber':
        return 'bg-amber-500';
      case 'red':
        return 'bg-red-500';
      case 'gold':
        return 'bg-[#c6a052]';
      default:
        return 'bg-[#57854d]';
    }
  };

  return (
    <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-[#141b16] border border-[#26332a] hover:border-[#35532e] transition-colors">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">{label}</span>
          {badge && (
            <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-[#1b241e] text-[#c6a052] border border-[#c6a052]/30">
              {badge}
            </span>
          )}
        </div>
        {description && (
          <p className="text-xs text-[#a4c29c] mt-0.5 leading-relaxed">{description}</p>
        )}
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
          checked ? getActiveClass() : 'bg-[#222d26]'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <span
          aria-hidden="true"
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
};
