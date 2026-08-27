import { redirect } from 'next/navigation'

/**
 * The app has one front door. Signed out, proxy.ts bounces /library to /sign-in.
 */
export default function RootPage() {
  redirect('/library')
}
