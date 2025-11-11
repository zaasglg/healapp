import { ReactNode } from 'react'

export interface CardProps {
  children: ReactNode
  className?: string
  onClick?: () => void
}

export const Card = ({ children, className = '', onClick }: CardProps) => {
  const baseStyles = 'bg-white rounded-xl border border-gray-200 p-4 shadow-sm transition-all'
  const interactiveStyles = onClick ? 'cursor-pointer hover:shadow-md hover:border-blue-primary' : ''
  
  return (
    <div 
      className={`${baseStyles} ${interactiveStyles} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  )
}











