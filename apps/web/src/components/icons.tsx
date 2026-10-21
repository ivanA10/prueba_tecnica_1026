import type { ReactNode } from 'react';

const base = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

const make = (children: ReactNode) =>
  function Icon({ size = 16 }: { size?: number }) {
    return (
      <svg {...base} width={size} height={size}>
        {children}
      </svg>
    );
  };

export const PencilIcon = make(
  <>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
  </>,
);
export const CrownIcon = make(<path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z" />);
export const BadgeIcon = make(
  <>
    <rect x="4" y="3" width="16" height="18" rx="2" />
    <circle cx="12" cy="10" r="2.5" />
    <path d="M8 17c.8-2 2.3-3 4-3s3.2 1 4 3" />
  </>,
);
export const PlusIcon = make(<path d="M12 5v14M5 12h14" />);
export const CloseIcon = make(<path d="M6 6l12 12M18 6L6 18" />);
export const CheckIcon = make(<path d="M5 12.5l4.5 4.5L19 7.5" />);
export const MinusIcon = make(<path d="M6 12h12" />);
export const CopyIcon = make(
  <>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V6a2 2 0 0 1 2-2h9" />
  </>,
);
export const CaretLeftIcon = make(<path d="M15 5l-7 7 7 7" />);
export const CaretRightIcon = make(<path d="M9 5l7 7-7 7" />);
export const UserIcon = make(
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c1-4 4-6 8-6s7 2 8 6" />
  </>,
);
export const GearIcon = make(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
  </>,
);
export const SignInIcon = make(
  <>
    <path d="M10 4H5v16h5" />
    <path d="M9 12h11M16 8l4 4-4 4" />
  </>,
);
export const WarningIcon = make(
  <>
    <path d="M12 3l10 18H2z" />
    <path d="M12 10v5M12 18v.5" />
  </>,
);
export const UserPlusIcon = make(
  <>
    <circle cx="10" cy="8" r="4" />
    <path d="M2 21c1-4 4-6 8-6M18 8v6M15 11h6" />
  </>,
);
export const CircleIcon = make(<circle cx="12" cy="12" r="6" />);
export const ChatIcon = make(<path d="M4 5h16v11H9l-5 4z" />);
export const UploadIcon = make(
  <>
    <path d="M12 16V4M7 9l5-5 5 5" />
    <path d="M4 20h16" />
  </>,
);
export const FileIcon = make(
  <>
    <path d="M6 3h8l4 4v14H6z" />
    <path d="M14 3v4h4M9 13h6M9 17h6" />
  </>,
);
export const SendIcon = make(<path d="M3 11l18-8-8 18-2-8z" />);
export const DatabaseIcon = make(
  <>
    <ellipse cx="12" cy="6" rx="8" ry="3" />
    <path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
  </>,
);
