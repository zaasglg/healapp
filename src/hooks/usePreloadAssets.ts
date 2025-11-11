import { useEffect } from 'react'

export const usePreloadAssets = (assets: string[]) => {
  useEffect(() => {
    if (!Array.isArray(assets) || assets.length === 0) return

    const links: HTMLLinkElement[] = []

    assets.forEach(asset => {
      if (!asset) return
      const link = document.createElement('link')
      link.rel = 'preload'
      link.as = 'image'
      link.href = asset
      document.head.appendChild(link)
      links.push(link)
    })

    return () => {
      links.forEach(link => {
        if (link.parentNode) {
          link.parentNode.removeChild(link)
        }
      })
    }
  }, [assets])
}


