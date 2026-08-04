import type { SVGProps } from "react";

export type IconName =
  | "about"
  | "bold"
  | "bulletList"
  | "chevronDown"
  | "close"
  | "code"
  | "document"
  | "eye"
  | "italic"
  | "link"
  | "maximize"
  | "minimize"
  | "moon"
  | "newDocument"
  | "numberedList"
  | "open"
  | "quote"
  | "redo"
  | "restore"
  | "save"
  | "saveAs"
  | "source"
  | "sun"
  | "system"
  | "undo";

const paths: Record<IconName, React.ReactNode> = {
  about: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/></>,
  bold: <path d="M8 5h5a3 3 0 0 1 0 6H8m0 0h5.7a3.5 3.5 0 0 1 0 7H8V5"/>,
  bulletList: <><path d="M9 7h11M9 12h11M9 17h11"/><circle cx="4.5" cy="7" r=".8"/><circle cx="4.5" cy="12" r=".8"/><circle cx="4.5" cy="17" r=".8"/></>,
  chevronDown: <path d="m8 10 4 4 4-4"/>,
  close: <path d="m7 7 10 10M17 7 7 17"/>,
  code: <><path d="m9 8-4 4 4 4M15 8l4 4-4 4"/><path d="m13.5 5-3 14"/></>,
  document: <><path d="M7 3.5h6l4 4V20H7z"/><path d="M13 3.5v4h4M9.5 12h5M9.5 15h5"/></>,
  eye: <><path d="M3 12s3.3-5 9-5 9 5 9 5-3.3 5-9 5-9-5-9-5Z"/><circle cx="12" cy="12" r="2.5"/></>,
  italic: <><path d="M10 5h7M7 19h7M14 5l-4 14"/></>,
  link: <><path d="m10 14 4-4"/><path d="M8.5 16.5 7 18a3.5 3.5 0 1 1-5-5l3-3a3.5 3.5 0 0 1 5 0"/><path d="m15.5 7.5 1.5-1.5a3.5 3.5 0 1 1 5 5l-3 3a3.5 3.5 0 0 1-5 0"/></>,
  maximize: <rect x="6" y="6" width="12" height="12"/>,
  minimize: <path d="M6 12h12"/>,
  moon: <path d="M19 15.5A8 8 0 0 1 8.5 5 8 8 0 1 0 19 15.5Z"/>,
  newDocument: <><path d="M7 3.5h6l4 4V20H7z"/><path d="M13 3.5v4h4M12 10v7M8.5 13.5h7"/></>,
  numberedList: <><path d="M10 7h10M10 12h10M10 17h10"/><path d="M4 5.5h1v3M3.5 8.5h2M3.5 11.5c.3-.5.7-.8 1.2-.8.7 0 1.2.4 1.2 1 0 1-2.3 1.5-2.3 2.8h2.5M3.6 16.2c.3-.4.7-.6 1.2-.6.7 0 1.2.4 1.2 1s-.5 1-1.2 1c.7 0 1.3.4 1.3 1s-.5 1.1-1.3 1.1c-.6 0-1.1-.2-1.4-.7"/></>,
  open: <><path d="M3.5 8h7l2 2H21l-2.5 9H5z"/><path d="M5 8V5h6l2 2h5v3"/></>,
  quote: <path d="M5 7h5v5H7c0 2 1 3 3 4M14 7h5v5h-3c0 2 1 3 3 4"/>,
  redo: <><path d="m15 7 4 4-4 4"/><path d="M19 11h-8a6 6 0 0 0-6 6"/></>,
  restore: <><rect x="5" y="8" width="11" height="11"/><path d="M8 8V5h11v11h-3"/></>,
  save: <><path d="M5 4h12l2 2v14H5z"/><path d="M8 4v6h8V4M8 20v-6h8v6"/></>,
  saveAs: <><path d="M4 4h12l2 2v7M7 4v6h8V4M7 20v-6h5"/><path d="m14 18 5-5 2 2-5 5-3 1z"/></>,
  source: <><path d="m9 7-5 5 5 5M15 7l5 5-5 5"/><path d="m13 4-2 16"/></>,
  sun: <><circle cx="12" cy="12" r="3.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>,
  system: <><rect x="3" y="4" width="18" height="13" rx="1"/><path d="M8 21h8M12 17v4"/></>,
  undo: <><path d="m9 7-4 4 4 4"/><path d="M5 11h8a6 6 0 0 1 6 6"/></>,
};

export function Icon({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
