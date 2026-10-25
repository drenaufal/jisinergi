import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

/** Everything except the login page, the auth endpoints and static files needs a session. */
export default auth((req) => {
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

export const config = {
  matcher: [
    "/((?!api/auth|_next/static|_next/image|icon.svg|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico|csv|json|webmanifest|txt)$).*)",
  ],
};
