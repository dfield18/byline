// Next.js 16 renamed `middleware.ts` to `proxy.ts`. clerkMiddleware()
// works unchanged here.
//
// Every route requires auth EXCEPT the marketing landing at `/`,
// which always renders the public landing regardless of session.
// Signed-in users navigate to the dashboard at `/subjects` via the
// in-page header link.
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

// `/api/demo/preview` is the public landing hero demo — it proxies to the
// backend's own unauthenticated, rate-limited demo endpoint, so it must NOT
// require a Clerk session (the landing visitor has none).
const isPublicRoute = createRouteMatcher([
  '/',
  '/privacy',
  '/terms',
  '/api/demo/preview',
])

// Dev-only auth bypass. Set BYLINE_AUTH=disabled when running
// `npm run dev` to skip the Clerk session check on authed routes
// entirely — useful for local QA, curl-based smoke tests, and
// agent-driven DOM inspection (the production Clerk redirect
// otherwise makes curl unable to see real spoke HTML).
//
// HARD-GUARDED by NODE_ENV. In a production build (`NODE_ENV ===
// "production"`), this check short-circuits to false regardless
// of BYLINE_AUTH's value — the env var cannot leak into a deployed
// environment and disable auth on the production app.
//
// Matches the FastAPI backend's BYLINE_AUTH=disabled flag (see
// app/api/auth.py). Set both for a fully auth-bypassed local
// stack; pair with BYLINE_API_TOKEN=any-string in web/.env.local
// so lib/api.ts's bearerToken() helper skips its Clerk session
// fetch and sends the placeholder bearer to the (already-bypassed)
// backend instead.
const isAuthDisabled =
  process.env.NODE_ENV !== 'production' &&
  process.env.BYLINE_AUTH === 'disabled'

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return
  if (isAuthDisabled) return
  const { userId, redirectToSignIn } = await auth()
  if (!userId) {
    return redirectToSignIn()
  }
})

export const config = {
  matcher: [
    // Skip Next internals + static assets; run on everything else.
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
    '/__clerk/(.*)',
  ],
}
