/**
 * RouterLite.tsx  ≈ 100 lines
 *
 * Features:
 *  ✅ path → component
 *  ✅ layout wrapper
 *  ✅ path params      /users/:id
 *  ✅ search params    ?q=abc
 *  ✅ navigate()
 *  ✅ Link
 *  ✅ RouterContext  → useParams / useSearchParams / useNavigate
 *  ❌ no auth / no nested routes (keep it simple)
 *
 * Only depends on React.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
  type FC,
} from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Params       = Record<string, string>;
export type SearchParams = Record<string, string>;

export interface Route {
  path: string;
  element: ReactNode;
  layout?: FC<{ children: ReactNode }>;
}

// ─── Router registry ─────────────────────────────────────────────────────────

let _routes: Route[] = [];

export function createRouter(routes: Route[]) {
  _routes = routes;
}

// ─── Path matching ────────────────────────────────────────────────────────────

function matchRoute(pathname: string): { route: Route; params: Params } | null {
  for (const route of _routes) {
    const paramNames: string[] = [];
    const pattern = route.path
      .replace(/:[^/]+/g, (m) => { paramNames.push(m.slice(1)); return "([^/]+)"; })
      .replace(/\//g, "\\/");
    const m = pathname.match(new RegExp(`^${pattern}$`));
    if (m) {
      const params: Params = {};
      paramNames.forEach((k, i) => { params[k] = m[i + 1]; });
      return { route, params };
    }
  }
  return null;
}

function parseSearch(): SearchParams {
  return Object.fromEntries(new URLSearchParams(location.search));
}

// ─── Navigation ───────────────────────────────────────────────────────────────

export function navigate(to: string, replace = false) {
  replace
    ? history.replaceState({}, "", to)
    : history.pushState({}, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

// ─── RouterContext ────────────────────────────────────────────────────────────

interface RouterCtx {
  params:       Params;
  searchParams: SearchParams;
  navigate:     typeof navigate;
}

const RouterContext = createContext<RouterCtx>({
  params:       {},
  searchParams: {},
  navigate,
});

// ─── Hooks ────────────────────────────────────────────────────────────────────

/** Access path params: /users/:id → useParams().id */
export function useParams(): Params {
  return useContext(RouterContext).params;
}

/** Access ?key=value pairs as a plain object */
export function useSearchParams(): SearchParams {
  return useContext(RouterContext).searchParams;
}

/** Programmatic navigation */
export function useNavigate(): typeof navigate {
  return useContext(RouterContext).navigate;
}

// ─── Link ─────────────────────────────────────────────────────────────────────

export function Link({ to, children, className }: {
  to: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={to}
      className={className}
      onClick={(e) => { e.preventDefault(); navigate(to); }}
    >
      {children}
    </a>
  );
}

// ─── RouterView ───────────────────────────────────────────────────────────────

export function RouterView() {
  const [, tick] = useState(0);

  useEffect(() => {
    const handler = () => tick((n) => n + 1);
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  const hit          = matchRoute(location.pathname);
  const params       = hit?.params       ?? {};
  const searchParams = parseSearch();
  const element      = hit?.route.element ?? <div>404 — Not Found</div>;
  const Layout       = hit?.route.layout;

  const ctx: RouterCtx = { params, searchParams, navigate };

  return (
    <RouterContext.Provider value={ctx}>
      {Layout ? <Layout>{element}</Layout> : <>{element}</>}
    </RouterContext.Provider>
  );
}