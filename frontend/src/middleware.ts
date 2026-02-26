// TODO: Next.js 16 has deprecated middleware.ts in favor of the proxy convention (src/proxy.ts)
// for request proxying/rewriting. However, auth redirect logic like this should be migrated
// to server components or layout-level checks using the cookies() API.
// For now, middleware.ts still works (deprecation warning only) — migrate when Next.js
// provides a stable alternative for auth redirects.
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const publicPaths = ['/login', '/register', '/setup', '/auth'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public assets and API routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/api')
  ) {
    return NextResponse.next();
  }

  // Setup page is always accessible (the page itself checks setup_required)
  if (pathname.startsWith('/setup')) {
    return NextResponse.next();
  }

  const token = request.cookies.get('access_token')?.value;

  // If visiting a public path while authenticated, redirect to dashboard
  if (publicPaths.some((p) => pathname.startsWith(p)) && token) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // If visiting a protected path without authentication, redirect to login
  if (!publicPaths.some((p) => pathname.startsWith(p)) && !token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
