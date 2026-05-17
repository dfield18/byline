// Next.js 16 renamed `middleware.ts` to `proxy.ts`. clerkMiddleware()
// works unchanged here.
//
// Every route requires auth EXCEPT the marketing landing at `/`. `/`
// renders the public landing for signed-out visitors and redirects
// signed-in visitors to `/subjects` (the real dashboard URL). The
// dispatch happens inside app/page.tsx.
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isPublicRoute = createRouteMatcher(['/'])

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return
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
