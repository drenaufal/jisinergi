import { auth } from "@/lib/auth";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

/** Must match STALE_SESSION_PARAM in lib/auth/session.ts (not imported: that module reads the database). */
const STALE_SESSION_PARAM = "sesi";

/** Auth.js session cookies, chunked ones (".0", ".1", …) and the secure-prefixed variant included. */
const isSessionCookie = (name: string) => /^(__Secure-)?authjs\.session-token(\.\d+)?$/.test(name);

/** Everything except the login page, the auth endpoints and static files needs a session. */
const guard = auth((req) => {
  const { pathname } = req.nextUrl;
  if (pathname === "/login") {
    if (req.auth) return NextResponse.redirect(new URL("/", req.nextUrl.origin));
    return NextResponse.next();
  }
  if (!req.auth) {
    const url = new URL("/login", req.nextUrl.origin);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
});

export default function proxy(req: NextRequest, event: NextFetchEvent) {
  // /login?sesi=habis: the session cookie is valid but its account is missing or inactive in this database (requireUser
  // sends it here, e.g. after DATABASE_URL was switched). Show the login form and drop the cookie. This runs outside
  // the Auth.js wrapper, which would otherwise send a signed-in visitor back to "/" (a redirect loop) and re-set the cookie.
  if (req.nextUrl.pathname === "/login" && req.nextUrl.searchParams.has(STALE_SESSION_PARAM)) {
    const res = NextResponse.next();
    for (const c of req.cookies.getAll()) if (isSessionCookie(c.name)) res.cookies.delete(c.name);
    return res;
  }
  // the Auth.js wrapper is typed for route handlers too; as a proxy it is called with (request, event)
  return (guard as unknown as (r: NextRequest, e: NextFetchEvent) => ReturnType<typeof guard>)(req, event);
}

export const config = {
  matcher: [
    "/((?!api/auth|_next/static|_next/image|icon.svg|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico|csv|json|webmanifest|txt)$).*)",
  ],
};
