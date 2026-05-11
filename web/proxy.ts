// Next.js 16 renamed `middleware.ts` to `proxy.ts`. clerkMiddleware()
// works unchanged here.
//
// We require auth on every route in this app. Signed-out users get
// redirected to Clerk's hosted sign-in (the default for pk_test apps
// without a self-hosted /sign-in route).
import { clerkMiddleware } from '@clerk/nextjs/server'

export default clerkMiddleware(async (auth) => {
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
