import { useEffect, useState } from 'react'
import type { TrainingJob } from '../types'

function finishMs(job: TrainingJob): number | null {
  if (!job.finishAt) return null
  const value = Date.parse(job.finishAt)
  return Number.isFinite(value) ? value : null
}

export function formatRemaining(finishAt: string | null | undefined, now = Date.now()): string {
  if (!finishAt) return 'en pausa'
  const finish = Date.parse(finishAt)
  if (!Number.isFinite(finish)) return 'en pausa'
  const minutes = Math.round((finish - now) / 60_000)
  if (minutes <= 0) return 'listo'
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const mins = minutes % 60
  if (days > 0) return `${days} d ${hours} h`
  if (hours > 0) return `${hours} h ${mins} min`
  return `${mins} min`
}

/** SP que faltan del nivel ya empezado, sin esperar a que ESI actualice los puntos. */
export function scheduledRemainingSp(job: TrainingJob, now = Date.now()): number {
  const levelEnd = job.levelEndSp
  const trainedStart = job.trainingStartSp ?? job.levelStartSp
  const start = job.startAt ? Date.parse(job.startAt) : NaN
  const finish = finishMs(job)
  if (
    levelEnd == null ||
    trainedStart == null ||
    levelEnd < trainedStart ||
    finish == null ||
    !Number.isFinite(start) ||
    finish <= start ||
    now <= start
  ) {
    return Math.max(0, job.remainingSp)
  }
  if (now >= finish) return 0
  const elapsed = (now - start) / (finish - start)
  const current = trainedStart + (levelEnd - trainedStart) * elapsed
  return Math.max(0, Math.round(levelEnd - current))
}

export function isTraining(job: TrainingJob | undefined, now = Date.now()): boolean {
  if (!job) return false
  const finish = finishMs(job)
  if (finish == null || finish <= now) return false
  if (!job.startAt) return true
  const start = Date.parse(job.startAt)
  return !Number.isFinite(start) || start <= now
}

/** Quita los niveles ya terminados y deja el siguiente como entrenamiento en curso. */
export function liveTrainingQueue(jobs: TrainingJob[], now = Date.now()): TrainingJob[] {
  return jobs
    .filter((job) => {
      const finish = finishMs(job)
      return finish == null || finish > now
    })
    .map((job, index) => {
      const remainingSp = scheduledRemainingSp(job, now)
      if (index !== 0) return { ...job, remainingSp }
      const training = isTraining(job, now)
      return {
        ...job,
        remainingSp,
        remaining: formatRemaining(job.finishAt, now),
        progress: training ? studiedPercent(job, now) / 100 : job.progress
      }
    })
}

export function queueRemainingLabel(jobs: TrainingJob[], now = Date.now()): string {
  if (jobs.length === 0) return 'vacía'
  const pending = liveTrainingQueue(jobs, now)
  if (pending.length === 0) return 'listo'
  return formatRemaining(pending[pending.length - 1]?.finishAt, now)
}

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
