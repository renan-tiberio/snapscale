import { joinWrapped } from './text.mjs'

const PHASE_HEADING = /^## Phase (\d+) — (.+)$/gm
const ARCHITECTURE_HEADING = /^### Phase (\d+) — (.+)$/gm
const DECISION_HEADING = /^## (\d+)\. (.+)$/gm
const MERMAID_FENCE = /^```mermaid\n([\s\S]*?)\n```$/gm
const LABELLED_FIELD = /\*\*([^*]+)\*\*:\s*([\s\S]*?)(?=\n\*\*|\n\n|$)/g

// A section ends at the next heading of its own level *or shallower* — the last
// `### Phase 9` block in docs/02 is otherwise followed by `## 4. Service
// boundaries`, and everything after it would be swallowed into phase 9.
const untilShallowerHeading = ({ body, level }) => {
  const boundary = body.search(new RegExp(`^#{1,${level}} `, 'm'))
  return boundary === -1 ? body : body.slice(0, boundary)
}

const sectionsByHeading = ({ source, pattern, level }) => {
  const matches = [...source.matchAll(pattern)]
  return matches.map((match, index) => {
    const nextMatch = matches[index + 1]
    const bodyStart = match.index + match[0].length
    const bodyEnd = nextMatch === undefined ? source.length : nextMatch.index
    return {
      key: match[1],
      headingRest: match[2],
      heading: match[0].replace(/^#+\s*/, ''),
      body: untilShallowerHeading({ body: source.slice(bodyStart, bodyEnd), level }).trim(),
    }
  })
}

const field = ({ body, label }) => {
  const pattern = new RegExp(`\\*\\*${label}\\*\\*:\\s*([\\s\\S]*?)(?=\\n\\*\\*|\\n\\n|$)`)
  const match = body.match(pattern)
  if (match === null) return null
  return match[1].trim()
}

// `Monolith (`phase-1-monolith`)` and `Queue (`phase-5-queue`) — coarser grain`
// are both legal phase headings in docs/04; the branch is the backticked part and
// anything after it is a qualifier the plan attaches to that phase.
const splitPhaseHeading = ({ headingRest }) => {
  const match = headingRest.match(/^(.*?)\s*\(`([^`]+)`\)\s*(.*)$/)
  if (match === null) return { name: headingRest.trim(), branch: null, qualifier: '' }
  return { name: match[1].trim(), branch: match[2], qualifier: match[3].trim() }
}

export const parsePlan = ({ source }) => {
  const sections = sectionsByHeading({ source, pattern: PHASE_HEADING, level: 2 })
  const phases = sections.map((section) => {
    const { name, branch, qualifier } = splitPhaseHeading({ headingRest: section.headingRest })
    return {
      number: Number(section.key),
      name,
      branch,
      qualifier,
      goal: field({ body: section.body, label: 'Goal' }),
      exitCriterion: field({ body: section.body, label: 'Exit criterion' }),
    }
  })
  const floorMatch = source.match(/Coverage ≥ (\d+)% lines/)
  const milestonesMatch = source.match(/\*\*Selected Milestones\*\*:\s*(.+)/)
  const statusMatch = source.match(/\n\*Status: ([\s\S]*?)\*\s*$/)
  return {
    phases,
    coverageFloorPercent: floorMatch === null ? null : Number(floorMatch[1]),
    declaredMilestones: milestonesMatch === null ? null : milestonesMatch[1].trim(),
    statusNote: statusMatch === null ? null : joinWrapped({ lines: statusMatch[1].split('\n') }),
  }
}

export const parseArchitecture = ({ source }) => {
  const sections = sectionsByHeading({ source, pattern: ARCHITECTURE_HEADING, level: 3 })
  return sections.map((section) => ({
    phaseNumber: Number(section.key),
    heading: section.heading,
    diagrams: [...section.body.matchAll(MERMAID_FENCE)].map((match) => match[1]),
    prose: section.body
      .replace(MERMAID_FENCE, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  }))
}

const decisionPhaseTag = ({ headingRest }) => {
  const match = headingRest.match(/\*\(phase (\d+)\)\*/)
  return match === null ? null : Number(match[1])
}

export const parseDecisionLog = ({ source }) => {
  const sections = sectionsByHeading({ source, pattern: DECISION_HEADING, level: 2 })
  return sections.map((section) => {
    const title = section.headingRest.replace(/\s*\*\(phase \d+\)\*\s*$/, '').trim()
    const overSplit = title.split(' — over ')
    return {
      number: Number(section.key),
      title,
      picked: overSplit[0],
      over: overSplit.length > 1 ? overSplit.slice(1).join(' — over ') : null,
      phaseNumber: decisionPhaseTag({ headingRest: section.headingRest }),
      fields: [...section.body.matchAll(LABELLED_FIELD)].map((match) => ({
        label: match[1].trim(),
        value: match[2].trim(),
      })),
    }
  })
}
