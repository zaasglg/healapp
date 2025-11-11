import type { HTMLAttributes } from 'react'

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  shine?: boolean
}

export const Skeleton = ({ className = '', shine = true, ...rest }: SkeletonProps) => {
  const baseClass = 'relative overflow-hidden rounded-2xl bg-gray-200'
  const shineClass =
    'after:absolute after:inset-0 after:-translate-x-full after:bg-gradient-to-r after:from-transparent after:via-white/60 after:to-transparent after:animate-[shine_1.6s_infinite]'
  const combined = [baseClass, shine ? shineClass : '', className].filter(Boolean).join(' ')

  return <div className={combined} {...rest} />
}



