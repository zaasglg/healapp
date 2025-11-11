import { InputHTMLAttributes, forwardRef } from 'react'

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string
  error?: string
  helperText?: string
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  (
    {
      label,
      error,
      helperText,
      className = '',
      id,
      ...props
    },
    ref
  ) => {
    const checkboxId = id || label?.toLowerCase().replace(/\s+/g, '-')
    
    return (
      <div className="flex items-start">
        <div className="flex items-center h-5">
          <input
            ref={ref}
            id={checkboxId}
            type="checkbox"
            className={`
              w-5 h-5
              rounded border-gray-300
              text-blue-primary
              focus:ring-2 focus:ring-blue-primary focus:ring-offset-0
              transition-colors
              cursor-pointer
              ${error ? 'border-red-500' : ''}
              ${className}
            `}
            {...props}
          />
        </div>
        {label && (
          <div className="ml-3 flex-1">
            <label
              htmlFor={checkboxId}
              className="text-sm font-manrope font-normal text-gray-dark cursor-pointer"
            >
              {label}
            </label>
            {error && (
              <p className="mt-1 text-sm font-manrope text-red-600">
                {error}
              </p>
            )}
            {helperText && !error && (
              <p className="mt-1 text-sm font-manrope text-gray-500">
                {helperText}
              </p>
            )}
          </div>
        )}
      </div>
    )
  }
)

Checkbox.displayName = 'Checkbox'








