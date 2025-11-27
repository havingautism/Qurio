import React, { useState, useEffect } from 'react';
import { X, Smile } from 'lucide-react';

const SpaceModal = ({ isOpen, onClose, editingSpace = null }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [emoji, setEmoji] = useState('🌍'); // Default emoji
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const pickerRef = React.useRef(null);
  const buttonRef = React.useRef(null);

  const emojis = [
    '🌍', '💻', '🎥', '💸', '🎨', '📚', '🎮', '🎵', '🍔', '⚽', '🚗', '🚀',
    '💡', '📷', '🎤', '🎧', '📱', '⌚', '🧱', '🧸', '🧵', '🧶', '🛒', '👓'
  ];

  // Handle click outside to close picker
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        pickerRef.current && 
        !pickerRef.current.contains(event.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target)
      ) {
        setShowEmojiPicker(false);
      }
    };

    if (showEmojiPicker) {
      document.addEventListener('click', handleClickOutside);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showEmojiPicker]);

  // Reset or populate form when modal opens/changes
  useEffect(() => {
    if (isOpen) {
      if (editingSpace) {
        setName(editingSpace.label);
        setDescription(editingSpace.description || '');
        // Assuming editingSpace might have an emoji field in the future, 
        // or we map the icon to an emoji. For now, keep default or existing logic.
        setEmoji('🌍'); 
      } else {
        setName('');
        setDescription('');
        setEmoji('🌍');
      }
      setShowEmojiPicker(false);
    }
  }, [isOpen, editingSpace]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-white dark:bg-[#191a1a] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-200 dark:border-zinc-800">
        
        {/* Header */}
        <div className="h-14 border-b border-gray-200 dark:border-zinc-800 flex items-center justify-between px-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {editingSpace ? 'Edit Space' : 'Create New Space'}
          </h3>
          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-500 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col gap-6">
          
          {/* Emoji Picker */}
          <div className="flex flex-col gap-2 relative">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Icon</label>
            <button 
              ref={buttonRef}
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-zinc-800 flex items-center justify-center text-2xl hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors border border-transparent focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 outline-none"
            >
              {emoji}
            </button>

            {/* Picker Popover */}
            {showEmojiPicker && (
              <div 
                ref={pickerRef}
                className="absolute top-full left-0 mt-2 p-2 bg-white dark:bg-[#202222] border border-gray-200 dark:border-zinc-700 rounded-xl shadow-xl z-10 grid grid-cols-6 gap-1 w-64"
              >
                {emojis.map((e) => (
                  <button
                    key={e}
                    onClick={() => {
                      setEmoji(e);
                      setShowEmojiPicker(false);
                    }}
                    className="w-9 h-9 flex items-center justify-center text-xl rounded hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors"
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Name Input */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Name</label>
            <input 
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Daily Life, Research..."
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600"
            />
          </div>

          {/* Description Input */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Description <span className="text-gray-400 font-normal">(Optional)</span></label>
            <textarea 
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this space for?"
              rows={3}
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600 resize-none"
            />
          </div>

        </div>

        {/* Footer */}
        <div className="h-16 border-t border-gray-200 dark:border-zinc-800 flex items-center justify-end px-6 gap-3 bg-gray-50/50 dark:bg-[#191a1a]">
          <button 
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={onClose} // Just close for now, logic to be added later
            className="px-4 py-2 rounded-lg text-sm font-medium bg-black dark:bg-white text-white dark:text-black hover:opacity-90 transition-opacity"
          >
            {editingSpace ? 'Save Changes' : 'Create Space'}
          </button>
        </div>

      </div>
    </div>
  );
};

export default SpaceModal;
