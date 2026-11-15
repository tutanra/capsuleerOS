import { memo, useMemo, useState } from 'react'
import { formatEveDate, formatNum } from '../lib/format'
import { useCharacter } from '../state/character'
import type { Skill, TrainingJob } from '../types'

type SectionId = 'queue' | 'trained' | 'untrained' | 'calc'

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: 'queue', label: 'Cola Actual' },
  { id: 'trained', label: 'Entrenados' },
  { id: 'untrained', label: 'Skill no obtenida' },
  { id: 'calc', label: 'Cálculos' }
]

function Pips({ level, trainingTo }: { level: number; trainingTo?: number }) {
  return (
    <span className="pips" aria-label={trainingTo ? `Entrenando al nivel ${trainingTo}` : `Nivel ${level}`}>
      {Array.from({ length: 5 }, (_, index) => {
        const rank = index + 1
        const learning = trainingTo === rank
        const filled = index < level
        const maxed = level === 5 && filled
        const className = learning ? 'pip learn' : maxed ? 'pip max' : filled ? 'pip on' : 'pip'
        return <i key={index} className={className} />
      })}
    </span>
  )
}

function parseSp(raw: string): number {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return 0
  const value = Number(digits)
  return Number.isFinite(value) ? value : 0
}

type Projected = {
  job: TrainingJob
  covered: number
  left: number
  finishAt: number | null
}

function projectQueue(jobs: TrainingJob[], extraSp: number, now = Date.now()): { rows: Projected[]; leftover: number } {
  let previousFinish = now
  const durations = jobs.map((job) => {
    if (!job.finishAt) return null
    const finish = new Date(job.finishAt).getTime()
    if (Number.isNaN(finish)) return null
    const duration = Math.max(0, finish - previousFinish)
    previousFinish = finish
    return duration
  })

  let budget = Math.max(0, extraSp)
  let cursor = now
  let clockKnown = true
  const rows = jobs.map((job, index) => {
    const need = Math.max(0, job.remainingSp ?? 0)
    const covered = Math.min(budget, need)
    budget -= covered
    const left = need - covered
    const duration = durations[index]
    let finishAt: number | null = null
    if (need === 0) {
      if (clockKnown && duration != null) cursor += duration
      finishAt = clockKnown ? cursor : null
    } else if (left === 0) {
      finishAt = cursor
    } else if (clockKnown && duration != null) {
      cursor += (left / need) * duration
      finishAt = cursor
    } else {
      clockKnown = false
    }
    return { job, covered, left, finishAt }
  })
  return { rows, leftover: budget }
}

function formatSpan(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000))
  if (minutes <= 0) return '0 h'
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  if (days > 0 && hours > 0) return `${days} d ${hours} h`
  if (days > 0) return `${days} d`
  if (hours > 0) return `${hours} h`
  return `${minutes} min`
}

function ownDuration(jobs: TrainingJob[], index: number): string {
  const finishAt = jobs[index]?.finishAt
  if (!finishAt) return 'En pausa'
  const finish = new Date(finishAt).getTime()
  if (Number.isNaN(finish)) return 'En pausa'
  if (index > 0 && !jobs[index - 1]?.finishAt) return 'En pausa'
  const previous = index === 0 ? Date.now() : new Date(jobs[index - 1]!.finishAt!).getTime()
  if (Number.isNaN(previous)) return 'En pausa'
  return formatSpan(finish - previous)
}

function matchesSkill(name: string, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase('es')
  if (!needle) return true
  return name.toLocaleLowerCase('es').includes(needle)
}

function SkillTable({ skills, queued, empty }: { skills: Skill[]; queued: Set<string>; empty: string }) {
  return (
    <table className="skills-table">
      <thead>
        <tr>
          <th>Habilidad</th>
          <th>Nivel</th>
          <th className="num">SP</th>
        </tr>
      </thead>
      <tbody>
        {skills.length === 0 && (
          <tr>
            <td colSpan={3}>{empty}</td>
          </tr>
        )}
        {skills.map((skill) => (
          <tr key={skill.name}>
            <td>
              {skill.name}
              {queued.has(skill.name) && <em> en cola</em>}
            </td>
            <td>
              <Pips level={skill.level} />
            </td>
            <td className="num">{formatNum(skill.sp)} SP</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export const Skills = memo(function Skills() {
  const profile = useCharacter().profile
  const skillGroups = profile?.skillGroups ?? []
  const trainingQueue = profile?.trainingQueue ?? []
  const [section, setSection] = useState<SectionId>('queue')
  const [spText, setSpText] = useState('')
  const [skillQuery, setSkillQuery] = useState('')
  const trained = skillGroups.flatMap((group) => group.skills)
  const untrained = profile?.unownedSkills ?? []
  const trainedVisible = trained.filter((skill) => matchesSkill(skill.name, skillQuery))
  const untrainedVisible = untrained.filter((skill) => matchesSkill(skill.name, skillQuery))
  const queued = new Set(trainingQueue.map((job) => job.name))
  const points = parseSp(spText)
  const projection = useMemo(() => projectQueue(trainingQueue, points), [trainingQueue, points])
  if (!profile) return null

  const completed = projection.rows.filter((row) => row.job.remainingSp > 0 && row.left === 0)
  const completedNames = new Set(completed.map((row) => row.job.name))
  const partial = projection.rows.find((row) => row.left > 0 && row.covered > 0)
  const queueSp = trainingQueue.reduce((sum, job) => sum + (job.remainingSp ?? 0), 0)
  const queueEnd = trainingQueue.at(-1)?.finishAt ?? null

  const counts: Record<SectionId, number | null> = {
    queue: trainingQueue.length,
    trained: trained.length,
    untrained: untrained.length,
    calc: null
  }

  let calcSummary = 'Escribe unos skill points para ver cuántas habilidades de la cola se completarían.'
  if (trainingQueue.length === 0) {
    calcSummary = 'La cola está vacía.'
  } else if (spText.trim()) {
    const levels = completed.length
    const names = completedNames.size
    const levelText = levels === 1 ? '1 nivel' : `${formatNum(levels)} niveles`
    const nameText = names === 1 ? '1 habilidad' : `${formatNum(names)} habilidades`
    calcSummary = `Con ${formatNum(points)} SP se completarían ${levelText} de la cola (${nameText}).`
    if (projection.leftover > 0) calcSummary += ` Sobrarían ${formatNum(projection.leftover)} SP.`
    else if (partial) {
      calcSummary += ` La siguiente, ${partial.job.name}, se quedaría a ${formatNum(partial.left)} SP.`
    }
  }

  return (
    <div className="stack">
      <div className="stack-main split skills-split">
        <div className="pane nav-list">
          {SECTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === section ? 'nav-item selected' : 'nav-item'}
              onClick={() => setSection(item.id)}
            >
              <span>{item.label}</span>
              {counts[item.id] != null && <span className="nav-meta">{counts[item.id]}</span>}
            </button>
          ))}
        </div>
        <div className="pane skill-pane">
          {(section === 'trained' || section === 'untrained') && (
            <form className="skill-filter" onSubmit={(event) => event.preventDefault()}>
              <label className="skill-filter-field">
                <input
                  value={skillQuery}
                  placeholder="Filtrar habilidad"
                  aria-label="Filtrar habilidad"
                  onChange={(event) => setSkillQuery(event.target.value)}
                />
                <button type="button" className="skill-clear" aria-label="Borrar filtro" onClick={() => setSkillQuery('')}>
                  ×
                </button>
              </label>
            </form>
          )}
          <div className="skill-scroll">
          {section === 'queue' && (
            <>
              <div className="skills-head">
                <span>{formatNum(queueSp)} SP restantes</span>
                <span>Fin de la cola {formatEveDate(queueEnd)}</span>
              </div>
              <table className="skills-table">
                <thead>
                  <tr>
                    <th>Habilidad</th>
                    <th className="num">SP restantes</th>
                    <th className="pips-cell">Nivel</th>
                    <th className="num">Días</th>
                    <th>Fin estimado</th>
                  </tr>
                </thead>
                <tbody>
                  {trainingQueue.length === 0 && (
                    <tr>
                      <td colSpan={5}>Sin trabajos en la cola.</td>
                    </tr>
                  )}
                  {trainingQueue.map((job, index) => {
                    const training = index === 0 && job.finishAt != null && Date.parse(job.finishAt) > Date.now()
                    return (
                    <tr key={`${job.name}-${job.to}-${index}`} className={training ? 'training' : undefined}>
                      <td>
                        {training && <i className="train-blink" title="Entrenando" />}
                        {job.name}
                      </td>
                      <td className="num">{formatNum(job.remainingSp ?? 0)} SP</td>
                      <td className="pips-cell">
                        <Pips level={job.from} trainingTo={training ? job.to : undefined} />
                      </td>
                      <td className="num">{ownDuration(trainingQueue, index)}</td>
                      <td className="mono">{formatEveDate(job.finishAt)}</td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </>
          )}
          {section === 'trained' && (
            <SkillTable
              skills={trainedVisible}
              queued={queued}
              empty={skillQuery.trim() ? 'Ninguna habilidad coincide.' : 'Sin habilidades en esta lista.'}
            />
          )}
          {section === 'untrained' && (
            <table className="skills-table">
              <thead>
                <tr>
                  <th>Libro no comprado</th>
                </tr>
              </thead>
              <tbody>
                {untrainedVisible.length === 0 && (
                  <tr>
                    <td>
                      {skillQuery.trim() ? 'Ninguna habilidad coincide.' : 'No hay libros de habilidad sin comprar.'}
                    </td>
                  </tr>
                )}
                {untrainedVisible.map((skill) => (
                  <tr key={skill.name}>
                    <td>{skill.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {section === 'calc' && (
            <>
              <form className="calc" onSubmit={(event) => event.preventDefault()}>
                <label>
                  Puntos de habilidad
                  <input
                    value={spText}
                    inputMode="numeric"
                    placeholder="250000"
                    onChange={(event) => setSpText(event.target.value)}
                  />
                </label>
                <p>{calcSummary}</p>
              </form>
              <table className="skills-table">
                <thead>
                  <tr>
                    <th>Habilidad</th>
                    <th className="num">SP restantes</th>
                    <th className="pips-cell">Nivel</th>
                    <th className="num">Tras el cálculo</th>
                    <th>Fin estimado</th>
                  </tr>
                </thead>
                <tbody>
                  {projection.rows.length === 0 && (
                    <tr>
                      <td colSpan={5}>Sin trabajos en la cola.</td>
                    </tr>
                  )}
                  {projection.rows.map((row, index) => (
                    <tr
                      key={`${row.job.name}-${row.job.to}-${index}`}
                      className={row.covered > 0 && row.left === 0 ? 'training' : undefined}
                    >
                      <td>
                        {row.job.name}
                      </td>
                      <td className="num">{formatNum(row.job.remainingSp ?? 0)} SP</td>
                      <td className="pips-cell">
                        <Pips level={row.left === 0 ? row.job.to : row.job.from} />
                      </td>
                      <td className="num">{formatNum(row.left)} SP</td>
                      <td className="mono">{formatEveDate(row.finishAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          </div>
        </div>
      </div>
    </div>
  )
})
