import { RouteLoading } from '@/components/ui/route-loading'

/** Shared immediate feedback for private screens without a route-specific shell. */
export default function AppLoading() {
  return <RouteLoading label="Loading page" />
}
