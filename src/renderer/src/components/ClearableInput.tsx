import type { InputHTMLAttributes } from 'react'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string
  onChange: (value: string) => void
  onClear?: () => void
  fieldClassName?: string
}

export function ClearableInput({
  value,
  onChange,
  onClear,
  fieldClassName,
  className,
  ...inputProps
}: Props) {
  const clear = () => {
    if (onClear) onClear()
    else onChange('')
  }

  return (
    <div className={['clear-field', fieldClassName].filter(Boolean).join(' ')}>
      <input
        {...inputProps}
        className={className}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {value.length > 0 && (
        <button type="button" className="input-clear" aria-label="Borrar" onClick={clear}>
          ×
        </button>
      )}
    </div>
  )
}
