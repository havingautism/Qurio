import React, { useState, useRef, useEffect } from 'react';
import MessageList from './MessageList';
import { Paperclip, ArrowRight, Mic, Globe, Layers, ChevronDown, Check } from 'lucide-react';

const ChatInterface = ({ spaces = [] }) => {
  const [input, setInput] = useState('');
  const [selectedSpaces, setSelectedSpaces] = useState([]);
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const selectorRef = useRef(null);

  // Initialize selectedSpaces with the first space if available, or none
  useEffect(() => {
    if (spaces.length > 0 && selectedSpaces.length === 0) {
      // Optional: Default to first space or keep empty
      // setSelectedSpaces([spaces[0]]); 
    }
  }, [spaces]);

  // Handle click outside to close selector
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (selectorRef.current && !selectorRef.current.contains(event.target)) {
        setIsSelectorOpen(false);
      }
    };

    if (isSelectorOpen) {
      document.addEventListener('click', handleClickOutside);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [isSelectorOpen]);

  const toggleSpaceSelection = (space) => {
    if (selectedSpaces.find(s => s.label === space.label)) {
      setSelectedSpaces(selectedSpaces.filter(s => s.label !== space.label));
    } else {
      setSelectedSpaces([...selectedSpaces, space]);
    }
  };

  // TODO: Import streamChatCompletion from '../lib/openai'
  // TODO: Import saveMessage from '../lib/supabase'

  const handleSendMessage = async () => {
    if (!input.trim()) return;

    // 1. Add user message to state
    // const userMessage = { role: 'user', content: input };
    // setMessages(prev => [...prev, userMessage]);

    // 2. Save user message to Supabase
    // await saveMessage(currentConversationId, userMessage);

    // 3. Prepare for streaming response
    // const aiMessagePlaceholder = { role: 'ai', content: '' };
    // setMessages(prev => [...prev, aiMessagePlaceholder]);

    // 4. Call OpenAI API
    /*
    await streamChatCompletion({
      apiKey: userSettings.apiKey,
      baseUrl: userSettings.baseUrl,
      model: userSettings.model,
      messages: [...messages, userMessage],
      useSearch: true, // Based on user toggle
      useReasoning: false, // Based on model capability
      onChunk: (chunk) => {
        // Update last message content with chunk
        setMessages(prev => {
          const newMessages = [...prev];
          const lastMsg = newMessages[newMessages.length - 1];
          lastMsg.content += chunk;
          return newMessages;
        });
      },
      onFinish: () => {
        // Save full AI message to Supabase
        // saveMessage(currentConversationId, fullAiMessage);
      },
      onError: (err) => {
        console.error(err);
      }
    });
    */
  };

  // Hardcoded data matching the image
  const [messages] = useState([
    {
      role: 'user',
      content: '服务器 df -h 没反应，是不是挂载出现问题了'
    },
    {
      role: 'ai',
      sources: [
        { title: 'Linux df命令卡死解决办法', domain: 'cnblogs.com' },
        { title: 'df -h 命令卡死解决办法', domain: 'csdn.net' },
        { title: 'Linux下df -h命令卡死解决方法', domain: 'huaweicloud.com' },
      ],
      content: `
        <p class="mb-4">是的，你的直觉非常准。<code>df -h</code> 命令卡住没反应 (Hanging)，绝大多数情况下就是因为挂载点 (Mount Point) 出现了问题，尤其是网络挂载 (如 NFS, SMB/CIFS) 连接中断或服务端不可达导致的。</p>
        
        <p class="mb-4">这是因为 <code>df</code> 命令默认会遍历所有挂载的文件系统去读取状态 (调用 <code>statfs</code> )，如果其中某个网络挂载点“死了” (例如网断了、存储服务器宕机)，<code>df</code> 就会一直等待响应，导致命令卡死。</p>

        <p class="mb-4 font-medium">以下是快速排查和解决的方法：</p>

        <h3 class="text-lg font-medium mb-2 mt-6">1. 快速验证：排除本地磁盘问题</h3>
        <p class="mb-4">使用 <code>-l</code> (local) 参数只看本地磁盘。如果这个命令能瞬间出结果，那就 100% 确定是网络挂载出的问题。</p>
        
        <div class="my-4 rounded-lg overflow-hidden border border-gray-200 dark:border-zinc-700">
          <div class="bg-gray-100 dark:bg-zinc-800 px-4 py-2 flex justify-between items-center">
            <span class="text-xs text-gray-500 dark:text-gray-400 font-mono">bash</span>
            <button class="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
          </div>
          <div class="bg-gray-50 dark:bg-[#1e1e1e] p-4 overflow-x-auto">
            <code class="text-sm font-mono text-gray-800 dark:text-gray-200">df -hl</code>
          </div>
        </div>

        <h3 class="text-lg font-medium mb-2 mt-6">2. 定位凶手：找出是哪个挂载点卡住了</h3>
        <p class="mb-4">如果 <code>df</code> 完全没反应，可以用 <code>strace</code> 追踪它卡在哪里。</p>
        
        <div class="my-4 rounded-lg overflow-hidden border border-gray-200 dark:border-zinc-700">
          <div class="bg-gray-100 dark:bg-zinc-800 px-4 py-2 flex justify-between items-center">
            <span class="text-xs text-gray-500 dark:text-gray-400 font-mono">bash</span>
            <button class="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
          </div>
          <div class="bg-gray-50 dark:bg-[#1e1e1e] p-4 overflow-x-auto">
            <code class="text-sm font-mono text-gray-800 dark:text-gray-200">strace df -h</code>
          </div>
        </div>
        
        <p class="mb-2 font-medium">如何看结果：</p>
        <p class="mb-4">屏幕会飞速滚动很多行，最后会停在某一行不动。停住的那一行通常是一个 <code>statfs</code> 或 <code>stat</code> 调用，括号里的路径就是出问题的挂载点。</p>
        
        <p class="mb-2">例如，如果最后卡在：</p>
        <div class="my-4 rounded-lg overflow-hidden border border-gray-200 dark:border-zinc-700">
          <div class="bg-gray-100 dark:bg-zinc-800 px-4 py-2 flex justify-between items-center">
            <span class="text-xs text-gray-500 dark:text-gray-400 font-mono">text</span>
             <button class="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
          </div>
          <div class="bg-gray-50 dark:bg-[#1e1e1e] p-4 overflow-x-auto">
            <code class="text-sm font-mono text-gray-800 dark:text-gray-200">statfs("/mnt/nfs_share", ...</code>
          </div>
        </div>
        
        <p class="mb-4">那就说明 <code>/mnt/nfs_share</code> 这个 NFS 挂载出问题了。</p>

        <h3 class="text-lg font-medium mb-2 mt-6">3. 紧急解决：强制卸载 (Lazy Unmount)</h3>
        <p class="mb-4">通常直接 <code>umount</code> 也会卡住，这时候需要用 "Lazy Unmount" (懒卸载)。它会立即把挂载点从文件系统层级中剥离，让 <code>df</code> 恢复正常，后台再慢慢清理连接。</p>
      `,
      related: [
        '如何定位导致 df 卡住的挂载点',
        '怎样在不影响系统的情况下卸载无响应挂载',
        '如何用命令检测并恢复失联的网络文件系统挂载'
      ]
    }
  ]);

  return (
    <div className="flex-1 min-h-screen bg-background text-foreground flex flex-col items-center relative p-4 ml-16">

      {/* Title Bar */}
      <div className="sticky top-0 z-20 w-full max-w-3xl bg-background/80 backdrop-blur-md py-4 mb-4 border-b border-transparent transition-all flex items-center gap-4">

        {/* Space Selector */}
        <div className="relative" ref={selectorRef}>
          <button
            onClick={() => setIsSelectorOpen(!isSelectorOpen)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            {selectedSpaces.length > 0 ? (
              <div className="flex items-center gap-2">
                <span className="text-lg">{selectedSpaces[0].emoji}</span>
                <span className="truncate max-w-[100px]">{selectedSpaces[0].label}</span>
                {selectedSpaces.length > 1 && (
                  <span className="text-xs text-gray-500">+{selectedSpaces.length - 1}</span>
                )}
              </div>
            ) : (
              <span className="text-gray-500">Select Space</span>
            )}
            <ChevronDown size={14} className="text-gray-400" />
          </button>

          {/* Dropdown */}
          {isSelectorOpen && (
            <div className="absolute top-full left-0 mt-2 w-56 bg-white dark:bg-[#202222] border border-gray-200 dark:border-zinc-700 rounded-xl shadow-xl z-30 overflow-hidden">
              <div className="p-2 flex flex-col gap-1">
                {spaces.map((space, idx) => {
                  const isSelected = selectedSpaces.some(s => s.label === space.label);
                  return (
                    <button
                      key={idx}
                      onClick={() => toggleSpaceSelection(space)}
                      className="flex items-center justify-between w-full px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-700/50 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{space.emoji}</span>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{space.label}</span>
                      </div>
                      {isSelected && <Check size={14} className="text-cyan-500" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <h1 className="text-xl font-medium text-gray-800 dark:text-gray-100 truncate flex-1">
          服务器 df -h 没反应
        </h1>
      </div>

      {/* Messages Area */}
      <div className="w-full max-w-3xl flex-1 pb-32">
        <MessageList messages={messages} />
      </div>

      {/* Sticky Input Area */}
      <div className="fixed bottom-0 left-16 right-0 bg-gradient-to-t from-background via-background to-transparent pb-6 pt-10 px-4 flex justify-center z-10">
        <div className="w-full max-w-3xl relative">
          <div className="relative bg-gray-100 dark:bg-zinc-800 border border-transparent focus-within:border-gray-300 dark:focus-within:border-zinc-600 rounded-xl transition-all duration-300 p-3">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask follow-up..."
              className="w-full bg-transparent border-none outline-none resize-none text-base placeholder-gray-500 dark:placeholder-gray-400 min-h-[44px] max-h-[200px] py-2"
              rows={1}
            />

            <div className="flex justify-between items-center mt-2">
              <div className="flex gap-2">
                <button className="p-2 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded-lg text-gray-500 dark:text-gray-400 transition-colors flex items-center gap-2 text-xs font-medium">
                  <Paperclip size={18} />
                </button>
                <button className="p-2 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded-lg text-gray-500 dark:text-gray-400 transition-colors flex items-center gap-2 text-xs font-medium">
                  <Globe size={18} />
                  <span>Search</span>
                </button>
                <button className="p-2 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded-lg text-gray-500 dark:text-gray-400 transition-colors flex items-center gap-2 text-xs font-medium">
                  <Layers size={18} />
                  <span>Think</span>
                </button>
              </div>

              <div className="flex gap-2">
                <button className="p-2 bg-gray-200 dark:bg-zinc-700 hover:bg-gray-300 dark:hover:bg-zinc-600 text-gray-500 dark:text-gray-300 rounded-full transition-colors disabled:opacity-50">
                  <ArrowRight size={18} />
                </button>
              </div>
            </div>
          </div>
          <div className="text-center mt-2 text-xs text-gray-400 dark:text-gray-500">
            Perplexity can make mistakes. Please use with caution.
          </div>
        </div>
      </div>

    </div>
  );
};

export default ChatInterface;
