"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

/**
 * Lets a page push its heading + meta line up into the persistent top Header
 * (which lives in the layout, above the page in the tree, so it can't read the
 * page's data directly). A page renders <SetHeaderTitle …/>; the Header reads
 * the context via useHeaderTitle(). When no page sets it, the Header falls back
 * to its route-derived label.
 */

type HeaderContent = { heading: string; meta?: string } | null;

const Ctx = createContext<{
  content: HeaderContent;
  setContent: (c: HeaderContent) => void;
}>({ content: null, setContent: () => {} });

export function HeaderTitleProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<HeaderContent>(null);
  return <Ctx.Provider value={{ content, setContent }}>{children}</Ctx.Provider>;
}

export function useHeaderTitle(): HeaderContent {
  return useContext(Ctx).content;
}

/** Render inside a page to set the Header's heading/meta; clears on unmount. */
export function SetHeaderTitle({ heading, meta }: { heading: string; meta?: string }) {
  const { setContent } = useContext(Ctx);
  useEffect(() => {
    setContent({ heading, meta });
    return () => setContent(null);
  }, [heading, meta, setContent]);
  return null;
}
