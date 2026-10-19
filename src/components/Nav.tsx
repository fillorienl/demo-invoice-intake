"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ICONS = {
  inbox: "M3 12h4l2 3h6l2-3h4M5 5h14l2 7v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z",
  erp: "M4 6c0-1.1 3.6-2 8-2s8 .9 8 2-3.6 2-8 2-8-.9-8-2zm0 0v12c0 1.1 3.6 2 8 2s8-.9 8-2V6M4 12c0 1.1 3.6 2 8 2s8-.9 8-2",
};

export function NavLink({ href, icon, label, count }: { href: string; icon: keyof typeof ICONS; label: string; count?: number }) {
  const path = usePathname();
  const active = href === "/" ? path === "/" || path.startsWith("/invoice") : path.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
        active ? "bg-white/10 text-white" : "text-white/65 hover:bg-white/5 hover:text-white"
      }`}
    >
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={ICONS[icon]} />
      </svg>
      <span className="flex-1">{label}</span>
      {count ? <span className="rounded-full bg-carbon px-2 py-px text-xs font-medium text-white">{count}</span> : null}
    </Link>
  );
}
