import React, { useEffect } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';
import clsx from 'clsx';

const Toast = ({ message, type = 'info', onClose, duration = 3000 }) => {
  useEffect(() => {
    if (duration) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const icons = {
    success: <CheckCircle size={20} className="text-green-500" />,
    error: <AlertCircle size={20} className="text-red-500" />,
    info: <Info size={20} className="text-blue-500" />,
  };

  const bgColors = {
    success: 'bg-[#1e1e1e] border-green-500/20',
    error: 'bg-[#1e1e1e] border-red-500/20',
    info: 'bg-[#1e1e1e] border-blue-500/20',
  };

  return (
    <div className={clsx(
      "flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg min-w-[300px] animate-in slide-in-from-bottom-5 fade-in duration-300",
      bgColors[type] || bgColors.info
    )}>
      {icons[type] || icons.info}
      <p className="flex-1 text-sm text-gray-200 font-medium">{message}</p>
      <button 
        onClick={onClose}
        className="text-gray-500 hover:text-gray-300 transition-colors"
      >
        <X size={16} />
      </button>
    </div>
  );
};

export default Toast;
