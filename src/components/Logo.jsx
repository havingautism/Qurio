import React from 'react';

const Logo = ({ size = 24, className = "" }) => {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
        >
            <path
                d="M12.0002 1.5L16.5002 4.09808V9.29423L12.0002 11.8923L7.50019 9.29423V4.09808L12.0002 1.5Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path
                d="M12.0002 11.8923V22.2846"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path
                d="M12.0002 11.8923L3.00019 6.69617"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path
                d="M12.0002 11.8923L21.0002 6.69617"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path
                d="M7.50019 19.6865L3.00019 17.0885V11.8923"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path
                d="M16.5002 19.6865L21.0002 17.0885V11.8923"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            {/* Adjusting to match the specific interlocking block look more closely */}
            <path
                d="M7.5 4.1L12 6.7L16.5 4.1"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path
                d="M16.5 19.7L12 17.1L7.5 19.7"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
};

// Re-implementing with a cleaner geometric path that matches the "Clarity" logo (3 interlocking cubes)
const ClarityLogo = ({ size = 24, className = "" }) => {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
        >
            {/* Top Cube */}
            <path d="M12 2L16.5 4.5V9.5L12 12L7.5 9.5V4.5L12 2Z" />
            <path d="M12 12V7" />
            <path d="M16.5 4.5L12 7L7.5 4.5" />

            {/* Bottom Right Cube */}
            <path d="M16.5 9.5L21 12V17L16.5 19.5L12 17V12L16.5 9.5Z" />
            <path d="M16.5 19.5V14.5" />
            <path d="M21 12L16.5 14.5L12 12" />

            {/* Bottom Left Cube */}
            <path d="M7.5 9.5L12 12V17L7.5 19.5L3 17V12L7.5 9.5Z" />
            <path d="M7.5 19.5V14.5" />
            <path d="M12 12L7.5 14.5L3 12" />
        </svg>
    );
};

export default ClarityLogo;
