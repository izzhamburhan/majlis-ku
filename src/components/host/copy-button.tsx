"use client";

import { useState } from "react";

export function CopyButton({ text, label, copiedLabel }: { text: string; label: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard?.writeText(text).catch(() => undefined);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="min-h-11 rounded-full border border-ink/20 bg-surface px-4 text-sm font-medium"
    >
      {copied ? copiedLabel : label}
    </button>
  );
}