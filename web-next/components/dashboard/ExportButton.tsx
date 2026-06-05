"use client";

/**
 * Export the current dashboard as a PDF via the browser's print dialog (which
 * offers "Save as PDF"). A print stylesheet in dashboard.css strips the app
 * chrome and lays the brief out cleanly for paper — so PR/public-affairs users
 * can forward a one-pager to principals and clients. No backend needed.
 */
export function ExportButton() {
  return (
    <button
      type="button"
      className="alt-cb-export"
      onClick={() => window.print()}
      title="Export this brief as a PDF"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <path d="M7 10l5 5 5-5" />
        <path d="M12 15V3" />
      </svg>
      Export
    </button>
  );
}
