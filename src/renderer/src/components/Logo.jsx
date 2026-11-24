import React from 'react';

export default function Logo({ size = 26, className }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="psychic-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--accent)" />
          <stop offset="55%" stopColor="var(--accent-3)" />
          <stop offset="100%" stopColor="var(--accent-2)" />
        </linearGradient>
        <linearGradient id="psychic-core" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" />
          <stop offset="100%" stopColor="var(--accent-2)" />
        </linearGradient>
      </defs>
      <path
        d="M16 2.2 28.6 9.4v13.2L16 29.8 3.4 22.6V9.4L16 2.2Z"
        stroke="url(#psychic-grad)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M16 6.6v6.2M16 19.2v6.2M7 16h6.2M18.8 16H25"
        stroke="url(#psychic-grad)"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.85"
      />
      <circle cx="16" cy="16" r="3.4" fill="url(#psychic-core)" opacity="0.95" />
      <circle cx="16" cy="16" r="5.6" stroke="url(#psychic-grad)" strokeWidth="0.8" opacity="0.5" />
      <circle cx="16" cy="6.6" r="1.1" fill="var(--accent)" />
      <circle cx="16" cy="25.4" r="1.1" fill="var(--accent-2)" />
      <circle cx="7" cy="16" r="1.1" fill="var(--accent-3)" />
      <circle cx="25" cy="16" r="1.1" fill="var(--accent)" />
    </svg>
  );
}
