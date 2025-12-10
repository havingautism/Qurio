import { useEffect } from 'react'
import { useRouter } from '@tanstack/react-router'
import { useNavigate } from '@tanstack/react-router'

/**
 * Component to handle redirects from GitHub Pages 404.html
 *
 * When a user directly navigates to a route like /qurio/spaces,
 * GitHub Pages returns a 404 and loads 404.html.
 * 404.html saves the original path to sessionStorage and redirects to /qurio/
 * This component checks for that saved path and redirects to the original destination.
 */
export function GitHubPagesRedirectHandler() {
  const router = useRouter()

  useEffect(() => {
    // Check if we have a saved redirect from 404.html
    const savedRedirect = sessionStorage.getItem('spa-redirect')

    if (savedRedirect) {
      try {
        const { path, search, hash } = JSON.parse(savedRedirect)

        // Remove the saved redirect to prevent loops
        sessionStorage.removeItem('spa-redirect')

        // Get the base path (e.g., /Qurio)
        const basePath = (import.meta.env.PUBLIC_BASE_PATH || '/Qurio').replace(/\/$/, '')

        // Extract the path relative to the base path
        const relativePath = path.replace(basePath, '') || '/'

        // Navigate to the original path
        router.navigate({
          to: relativePath,
          search: search ? new URLSearchParams(search.substring(1)) : undefined,
          hash: hash.substring(1) || undefined,
          replace: true // Replace in history to avoid back button issues
        })
      } catch (error) {
        console.error('Failed to parse saved redirect:', error)
        sessionStorage.removeItem('spa-redirect')
      }
    }
  }, [router])

  // This component doesn't render anything
  return null
}