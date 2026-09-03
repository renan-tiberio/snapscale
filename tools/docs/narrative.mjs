// The phase-report contract, enforced. docs/phases/README.md is the prose
// version of what this file checks; a narrative that breaks the contract stops
// the build instead of being rendered half-understood.

export const FRONTMATTER_KEYS = ['phase', 'name', 'branch', 'status']
export const STATUS_VALUES = ['done', 'pending']
export const SECTION_HEADINGS = [
  'Goal',
  'What changed and why',
  'What was proven',
  'What surprised',
  'Open items',
]

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n?/
const H2 = /^## (.+)$/gm

const parseFrontmatter = ({ block }) =>
  block
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const separator = line.indexOf(':')
      if (separator === -1) return { key: line.trim(), value: null }
      return { key: line.slice(0, separator).trim(), value: line.slice(separator + 1).trim() }
    })

const splitSections = ({ body }) => {
  const matches = [...body.matchAll(H2)]
  return matches.map((match, index) => {
    const next = matches[index + 1]
    return {
      heading: match[1].trim(),
      body: body
        .slice(match.index + match[0].length, next === undefined ? body.length : next.index)
        .trim(),
    }
  })
}

const headingErrors = ({ sections }) => {
  const found = sections.map((section) => section.heading)
  if (
    found.length === SECTION_HEADINGS.length &&
    found.every((heading, index) => heading === SECTION_HEADINGS[index])
  ) {
    return []
  }
  return [
    `H2 headings must be exactly, in order: ${SECTION_HEADINGS.map((heading) => `"${heading}"`).join(', ')}. Found: ${found.length === 0 ? '(none)' : found.map((heading) => `"${heading}"`).join(', ')}.`,
  ]
}

const frontmatterErrors = ({ entries }) => {
  const keys = entries.map((entry) => entry.key)
  const missing = FRONTMATTER_KEYS.filter((key) => !keys.includes(key))
  const status = entries.find((entry) => entry.key === 'status')?.value
  return [
    ...missing.map((key) => `frontmatter key "${key}" is missing`),
    ...(status !== undefined && !STATUS_VALUES.includes(status)
      ? [`frontmatter status must be one of ${STATUS_VALUES.join(' | ')}, found "${status}"`]
      : []),
  ]
}

const frontmatterWarnings = ({ entries }) => {
  const keys = entries.map((entry) => entry.key)
  const extra = keys.filter((key) => !FRONTMATTER_KEYS.includes(key))
  const declaredOrder = keys.filter((key) => FRONTMATTER_KEYS.includes(key))
  const orderIsCanonical = declaredOrder.every((key, index) => key === FRONTMATTER_KEYS[index])
  return [
    ...extra.map(
      (key) =>
        `frontmatter carries an extra key "${key}", which the contract in docs/phases/README.md does not define`,
    ),
    ...(orderIsCanonical
      ? []
      : [`frontmatter keys are out of the contract's order (${FRONTMATTER_KEYS.join(', ')})`]),
  ]
}

export const parsePhaseNarrative = ({ source, path, expected }) => {
  const frontmatterMatch = source.match(FRONTMATTER)
  if (frontmatterMatch === null) {
    return { errors: [`${path}: no YAML frontmatter delimited by --- at the top of the file`] }
  }
  const entries = parseFrontmatter({ block: frontmatterMatch[1] })
  const sections = splitSections({ body: source.slice(frontmatterMatch[0].length) })
  const errors = [...frontmatterErrors({ entries }), ...headingErrors({ sections })].map(
    (error) => `${path}: ${error}`,
  )
  if (errors.length > 0) return { errors }
  const valueOf = (key) => entries.find((entry) => entry.key === key)?.value ?? null
  const mismatches = [
    valueOf('phase') === String(expected.number)
      ? null
      : `${path}: frontmatter phase is "${valueOf('phase')}" but the file is read as phase ${expected.number}`,
    valueOf('branch') === expected.branch
      ? null
      : `${path}: frontmatter branch is "${valueOf('branch')}" but docs/04-implementation-plan.md declares "${expected.branch}"`,
    valueOf('name') === expected.name
      ? null
      : `${path}: frontmatter name is "${valueOf('name')}" but docs/04-implementation-plan.md declares "${expected.name}"`,
  ].filter((mismatch) => mismatch !== null)
  return {
    path,
    frontmatter: {
      phase: valueOf('phase'),
      name: valueOf('name'),
      branch: valueOf('branch'),
      status: valueOf('status'),
      entries,
    },
    sections,
    warnings: [
      ...frontmatterWarnings({ entries }).map((warning) => `${path}: ${warning}`),
      ...mismatches,
    ],
  }
}
