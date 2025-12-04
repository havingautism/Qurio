import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import useScrollLock from '../hooks/useScrollLock';

const SpaceModal = ({ isOpen, onClose, editingSpace = null, onSave, onDelete }) => {
  useScrollLock(isOpen);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [prompt, setPrompt] = useState('');
  const [emoji, setEmoji] = useState('🌍'); // Default emoji
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const pickerRef = useRef(null);
  const buttonRef = useRef(null);

  const emojis = [
    '🌍', '💻', '📚', '🧠', '🎬', '📈', '🧪', '🎧', '📸', '🗺️', '📝', '🧩',
    '🪴', '🎨', '⚡', '🚀', '📖', '🔬', '🎮', '🧘', '🧭', '🪐', '📊'
  ];

  // Close picker when clicking outside
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
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showEmojiPicker]);

  // Populate form when modal opens/changes
  useEffect(() => {
    if (isOpen) {
      if (editingSpace) {
        setName(editingSpace.label || '');
        setDescription(editingSpace.description || '');
        setPrompt(editingSpace.prompt || '');
        setEmoji(editingSpace.emoji || '🌍');
      } else {
        setName('');
        setDescription('');
        setPrompt('');
        setEmoji('🌍');
      }
      setShowEmojiPicker(false);
      setError('');
      setIsSaving(false);
    }
  }, [isOpen, editingSpace]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    setIsSaving(true);
    setError('');
    try {
      await onSave?.({
        emoji,
        label: name.trim(),
        description: description.trim(),
        prompt: prompt.trim(),
      });
    } catch (err) {
      setError(err.message || 'Failed to save space');
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingSpace?.id) return;
    const confirmed = window.confirm('Delete this space? This cannot be undone.');
    if (!confirmed) return;
    try {
      await onDelete?.(editingSpace.id);
    } catch (err) {
      setError(err.message || 'Failed to delete space');
    }
  };

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
        <div className="p-6 flex flex-col gap-4">

          {/* Icon and Name Row */}
          <div className="flex gap-4">
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
            <div className="flex flex-col gap-2 flex-1">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Daily Life, Research..."
                className="w-full h-12 px-4 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600"
              />
            </div>
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

          {/* Prompt Input */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Space Prompt <span className="text-gray-400 font-normal">(Optional)</span></label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Provide guidance the assistant should follow inside this space."
              rows={3}
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600 resize-none"
            />
          </div>

          {error && (
            <div className="text-sm text-red-500">{error}</div>
          )}

        </div>

        {/* Footer */}
        <div className="h-16 border-t border-gray-200 dark:border-zinc-800 flex items-center justify-between px-6 gap-3 bg-gray-50/50 dark:bg-[#191a1a]">
          <div className="flex items-center gap-2">
            {editingSpace && (
              <button
                onClick={handleDelete}
                className="px-4 py-2 rounded-lg text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                Delete
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-black dark:bg-white text-white dark:text-black hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : editingSpace ? 'Save Changes' : 'Create Space'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default SpaceModal;
