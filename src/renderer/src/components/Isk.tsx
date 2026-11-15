import { IskIcon } from './Icons'
import { formatNum } from '../lib/format'

type Props = {
  value: number
  signed?: boolean
  className?: string
}

export function Isk({ value, signed = false, className }: Props) {
  const amount = formatNum(Math.abs(value), 2)
  const prefix = signed ? (value > 0 ? '+' : value < 0 ? '−' : '') : ''
  return (
    <span className={['isk-amount', className].filter(Boolean).join(' ')} title={`${prefix}${amount} ISK`}>
      <span className="isk-amount-num">
        {prefix}
        {amount}
      </span>
      <IskIcon />
    </span>
  )
}
