import React from 'react';

const DotLoader = () => {
    return (
        <div className="flex items-center gap-1 h-full py-1">
            <div className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
            <div className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
            <div className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce"></div>
        </div>
    );
};

export default DotLoader;
