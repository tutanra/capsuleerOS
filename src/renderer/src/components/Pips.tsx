type Props = {
  level: number
  trainingTo?: number
  queueTo?: number
}

export function Pips({ level, trainingTo, queueTo }: Props) {
  const target = queueTo ?? trainingTo
  return (
    <span
      className="pips"
      aria-label={
        trainingTo
          ? `Entrenando al nivel ${trainingTo}`
          : target
            ? `Nivel ${level}, en cola hasta ${target}`
            : `Nivel ${level}`
      }
    >
      {Array.from({ length: 5 }, (_, index) => {
        const rank = index + 1
        const learning = trainingTo === rank
        const queued = !learning && target != null && rank > level && rank <= target
        const filled = index < level
        const maxed = level === 5 && filled
        const className = learning
          ? 'pip learn'
          : queued
            ? 'pip queued'
            : maxed
              ? 'pip max'
              : filled
                ? 'pip on'
                : 'pip'
        return <i key={index} className={className} />
      })}
    </span>
  )
}
