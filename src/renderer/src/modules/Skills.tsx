import { memo, useMemo, useState } from 'react'
import { ClearableInput } from '../components/ClearableInput'
import { Pips } from '../components/Pips'
import { SkillTip } from '../components/SkillTip'
import { formatEveDate, formatNum } from '../lib/format'
import { usePaneWidth } from '../lib/paneWidth'
import { isTraining, liveTrainingQueue, studiedPercent, useNow } from '../lib/training'
import { useCharacter } from '../state/character'
import { useSettings } from '../state/settings'
import type { Skill, TrainingJob } from '../types'

type SectionId = 'queue' | 'trained' | 'calc'

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: 'queue', label: 'Cola Actual' },
  { id: 'trained', label: 'Entrenados' },
  { id: 'calc', label: 'Cálculos' }
]

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

function ownDuration(jobs: TrainingJob[], index: number, now: number): string {
  const finishAt = jobs[index]?.finishAt
  if (!finishAt) return 'En pausa'
  const finish = new Date(finishAt).getTime()
  if (Number.isNaN(finish)) return 'En pausa'
  if (index > 0 && !jobs[index - 1]?.finishAt) return 'En pausa'
  const previous = index === 0 ? now : new Date(jobs[index - 1]!.finishAt!).getTime()
  if (Number.isNaN(previous)) return 'En pausa'
  return formatSpan(finish - previous)
}

function matchesSkill(name: string, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase('es')
  if (!needle) return true
  return name.toLocaleLowerCase('es').includes(needle)
}

function SkillRows({
  skills,
  queued,
  queueTarget,
  trainingTo,
  studied
}: {
  skills: Skill[]
  queued: Set<string>
  queueTarget: Map<string, number>
  trainingTo?: { name: string; to: number }
  studied?: number
}) {
  return (
    <table className="skills-table dense">
      <thead>
        <tr>
          <th>Habilidad</th>
          <th className="num">SP</th>
          <th className="pips-cell">Nivel</th>
        </tr>
      </thead>
      <tbody>
        {skills.map((skill) => (
          <tr key={skill.name} className={skill.buy ? 'skill-buy' : undefined}>
            <td>
              <SkillTip typeId={skill.typeId} name={skill.name}>
                {skill.buy ? <em className="buy-tag"> comprar</em> : queued.has(skill.name) && <em> en cola</em>}
              </SkillTip>
              {studied != null && trainingTo?.name === skill.name && <span className="train-pct">{studied}%</span>}
            </td>
            <td className="num">{skill.buy ? '—' : `${formatNum(skill.sp)} SP`}</td>
            <td className="pips-cell">
              {skill.buy ? (
                <span className="dim">—</span>
              ) : (
                <Pips
                  level={skill.level}
                  queueTo={queueTarget.get(skill.name)}
                  trainingTo={trainingTo?.name === skill.name ? trainingTo.to : undefined}
                />
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function SkillGroupSection({
  title,
  skills,
  queued,
  queueTarget,
  trainingTo,
  studied,
  forceOpen
}: {
  title: string
  skills: Skill[]
  queued: Set<string>
  queueTarget: Map<string, number>
  trainingTo?: { name: string; to: number }
  studied?: number
  forceOpen: boolean
}) {
  const [open, setOpen] = useState(true)
  const expanded = forceOpen || open
  return (
    <>
      <button
        type="button"
        className="inv-label"
        aria-expanded={expanded}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="twist" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
        {title}
        <span className="nav-meta">{skills.length}</span>
      </button>
      {expanded && (
        <SkillRows skills={skills} queued={queued} queueTarget={queueTarget} trainingTo={trainingTo} studied={studied} />
      )}
    </>
  )
}

export const Skills = memo(function Skills() {
  const profile = useCharacter().profile
  useSettings().clockMode
  const skillGroups = profile?.skillGroups ?? []
  const trainingQueue = profile?.trainingQueue ?? []
  const [section, setSection] = useState<SectionId>('queue')
  const [spText, setSpText] = useState('')
  const [skillQuery, setSkillQuery] = useState('')
  const nav = usePaneWidth('capsuleeros.skillsNav', 228, 132, 420)
  const trained = skillGroups.flatMap((group) => group.skills)
  const untrained = profile?.unownedSkills ?? []
  const trainedGroups = useMemo(() => {
    const byGroup = new Map<string, Skill[]>()
    for (const group of skillGroups) {
      const skills = group.skills.filter((skill) => matchesSkill(skill.name, skillQuery))
      if (skills.length > 0) byGroup.set(group.name, skills)
    }
    for (const skill of untrained) {
      if (!matchesSkill(skill.name, skillQuery)) continue
      const name = skill.group ?? 'Other'
      const list = byGroup.get(name) ?? []
      list.push(skill)
      byGroup.set(name, list)
    }
    return [...byGroup.entries()]
      .map(([name, skills]) => ({
        name,
        skills: [...skills].sort((a, b) => a.name.localeCompare(b.name, 'en'))
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'en'))
  }, [skillGroups, untrained, skillQuery])
  const now = useNow()
  const queue = useMemo(() => liveTrainingQueue(trainingQueue, now), [trainingQueue, now])
  const queued = new Set(queue.map((job) => job.name))
  const queueTarget = useMemo(() => {
    const map = new Map<string, number>()
    for (const job of queue) {
      map.set(job.name, Math.max(map.get(job.name) ?? 0, job.to))
    }
    return map
  }, [queue])
  const points = parseSp(spText)
  const projection = useMemo(() => projectQueue(queue, points, now), [queue, points, now])
  if (!profile) return null

  const completed = projection.rows.filter((row) => row.job.remainingSp > 0 && row.left === 0)
  const completedNames = new Set(completed.map((row) => row.job.name))
  const partial = projection.rows.find((row) => row.left > 0 && row.covered > 0)
  const queueSp = queue.reduce((sum, job) => sum + (job.remainingSp ?? 0), 0)
  const queueEnd = queue.at(-1)?.finishAt ?? null
  const activeJob = queue[0]
  const activeTraining = activeJob && isTraining(activeJob, now) ? { name: activeJob.name, to: activeJob.to } : undefined

  const counts: Record<SectionId, number | null> = {
    queue: queue.length,
    trained: trained.length,
    calc: null
  }

  let calcSummary = 'Escribe unos skill points para ver cuántas habilidades de la cola se completarían.'
  if (queue.length === 0) {
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
      <div ref={nav.ref} className="stack-main split skills-split" style={nav.style}>
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
        <div
          className="pane-resize"
          role="separator"
          aria-orientation="vertical"
          aria-label="Ancho de las secciones de habilidades"
          aria-valuemin={nav.min}
          aria-valuemax={nav.max}
          aria-valuenow={nav.width}
          tabIndex={0}
          onPointerDown={nav.onPointerDown}
          onPointerMove={nav.onPointerMove}
          onKeyDown={nav.onKeyDown}
        />
        <div className="pane skill-pane">
          {section === 'trained' && (
            <form className="skill-filter" onSubmit={(event) => event.preventDefault()}>
              <ClearableInput
                fieldClassName="skill-filter-field"
                value={skillQuery}
                onChange={setSkillQuery}
                placeholder="Filtrar habilidad"
                aria-label="Filtrar habilidad"
              />
            </form>
          )}
          <div className="skill-scroll">
          {section === 'queue' && (
            <>
              <div className="skills-head">
                <span>{formatNum(queueSp)} SP restantes</span>
                <span>Fin de la cola {formatEveDate(queueEnd)}</span>
              </div>
              <table className="skills-table dense">
                <thead>
                  <tr>
                    <th>Habilidad</th>
                    <th className="num">SP restantes</th>
                    <th className="num">Días</th>
                    <th>Fin estimado</th>
                    <th className="pips-cell">Nivel</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.length === 0 && (
                    <tr>
                      <td colSpan={5}>Sin trabajos en la cola.</td>
                    </tr>
                  )}
                  {queue.map((job, index) => {
                    const training = index === 0 && isTraining(job, now)
                    return (
                    <tr key={`${job.name}-${job.to}-${index}`} className={training ? 'training' : 'queued'}>
                      <td>
                        {training && <i className="train-blink" title="Entrenando" />}
                        <SkillTip typeId={job.typeId} name={job.name} />
                        {training && <span className="train-pct">{studiedPercent(job, now)}%</span>}
                      </td>
                      <td className="num">{formatNum(job.remainingSp ?? 0)} SP</td>
                      <td className="num">{ownDuration(queue, index, now)}</td>
                      <td className="mono">{formatEveDate(job.finishAt)}</td>
                      <td className="pips-cell">
                        <Pips
                          level={job.from}
                          queueTo={job.to}
                          trainingTo={training ? job.to : undefined}
                        />
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </>
          )}
          {section === 'trained' && (
            trainedGroups.length === 0 ? (
              <p className="empty">
                {skillQuery.trim() ? 'Ninguna habilidad coincide.' : 'Sin habilidades en esta lista.'}
              </p>
            ) : (
              trainedGroups.map((group) => (
                <SkillGroupSection
                  key={group.name}
                  title={group.name}
                  skills={group.skills}
                  queued={queued}
                  queueTarget={queueTarget}
                  trainingTo={activeTraining}
                  studied={activeTraining && activeJob ? studiedPercent(activeJob, now) : undefined}
                  forceOpen={skillQuery.trim().length > 0}
                />
              ))
            )
          )}
          {section === 'calc' && (
            <>
              <form className="calc" onSubmit={(event) => event.preventDefault()}>
                <label>
                  Puntos de habilidad
                  <ClearableInput
                    fieldClassName="calc-field"
                    value={spText}
                    onChange={setSpText}
                    inputMode="numeric"
                    placeholder="250000"
                  />
                </label>
                <p>{calcSummary}</p>
              </form>
              <table className="skills-table dense">
                <thead>
                  <tr>
                    <th>Habilidad</th>
                    <th className="num">SP restantes</th>
                    <th className="num">Cálculo</th>
                    <th>Fin estimado</th>
                    <th className="pips-cell">Nivel</th>
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
                        <SkillTip typeId={row.job.typeId} name={row.job.name} />
                      </td>
                      <td className="num">{formatNum(row.job.remainingSp ?? 0)} SP</td>
                      <td className="num">{formatNum(row.left)} SP</td>
                      <td className="mono">{formatEveDate(row.finishAt)}</td>
                      <td className="pips-cell">
                        <Pips level={row.left === 0 ? row.job.to : row.job.from} />
                      </td>
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
