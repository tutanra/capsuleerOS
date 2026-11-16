import { useEffect, useState } from 'react'
import type { TrainingJob } from '../types'

/** Porcentaje del nivel en curso, avanzando con el reloj entre refrescos. */
export function studiedPercent(job: TrainingJob, now = Date.now()): number {
  const startMs = job.startAt ? Date.parse(job.startAt) : NaN
  const finishMs = job.finishAt ? Date.parse(job.finishAt) : NaN
  const levelStart = job.levelStartSp
  const levelEnd = job.levelEndSp
  const trainedStart = job.trainingStartSp
  if (
    Number.isFinite(startMs) &&
    Number.isFinite(finishMs) &&
    finishMs > startMs &&
    levelStart != null &&
    levelEnd != null &&
    trainedStart != null &&
    levelEnd > levelStart
  ) {
    const elapsed = Math.min(1, Math.max(0, (now - startMs) / (finishMs - startMs)))
    const current = trainedStart + (levelEnd - trainedStart) * elapsed
    return Math.min(100, Math.max(0, Math.round(((current - levelStart) / (levelEnd - levelStart)) * 100)))
  }
  return Math.min(100, Math.max(0, Math.round((job.progress ?? 0) * 100)))
}

export function useNow(intervalMs = 15000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])
  return now
}
