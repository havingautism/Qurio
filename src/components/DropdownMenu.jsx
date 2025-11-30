import React, { useEffect, useRef } from 'react';
import clsx from 'clsx';

const DropdownMenu = ({ isOpen, onClose, items, position = 'bottom-right' }) => {
  const menuRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const positionClasses = {
    'bottom-right': 'top-full right-0 mt-1',
    'bottom-left': 'top-full left-0 mt-1',
  };

  return (
    <div
      ref={menuRef}
      className={clsx(
        'absolute z-50 min-w-[160px] bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg shadow-lg py-1',
        positionClasses[position] || positionClasses['bottom-right']
      )}
    >
      {items.map((item, index) => (
        <button
          key={index}
          onClick={(e) => {
            e.stopPropagation();
            item.onClick();
            onClose();
          }}
          className={clsx(
            'w-full px-4 py-2 text-left text-sm transition-colors flex items-center gap-2',
            item.danger
              ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
              : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-700'
          )}
        >
          {item.icon && <span>{item.icon}</span>}
          <span className="font-medium text-xs">{item.label}</span>
        </button>
      ))}
    </div>
  );
};

export default DropdownMenu;
