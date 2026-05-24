import * as React from 'react'

const MOBILE_BREAKPOINT = 768

export function useIsMobile(maxWidth = MOBILE_BREAKPOINT) {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mediaQuery = window.matchMedia(`(max-width: ${maxWidth}px)`)
    const onChange = () => {
      setIsMobile(mediaQuery.matches)
    }
    mediaQuery.addEventListener('change', onChange)
    setIsMobile(mediaQuery.matches)
    return () => mediaQuery.removeEventListener('change', onChange)
  }, [maxWidth])

  return !!isMobile
}
