"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import "./loading-indicator.css";

export function LoadingIndicator() {
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);
  const [prevPathname, setPrevPathname] = useState(pathname);

  useEffect(() => {
    if (pathname !== prevPathname) {
      setLoading(true);
      setPrevPathname(pathname);

      // ローディング表示を最低限表示してから消す
      const timer = setTimeout(() => {
        setLoading(false);
      }, 300);

      return () => clearTimeout(timer);
    }
  }, [pathname, prevPathname]);

  if (!loading) {
    return null;
  }

  return (
    <div className="loading-indicator">
      <div className="loading-bar"></div>
    </div>
  );
}
