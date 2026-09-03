import { git, gitLines, refExists } from './repo.mjs'

// `%h %cI %s`: neither an abbreviated sha nor an ISO date contains a space,
// so the first two fields split off cleanly and the rest is the subject.
const LOG_LINE = /^(\S+) (\S+) (.*)$/
const CONVENTIONAL_SUBJECT = /^([a-z]+)(\([^)]*\))?!?:/
const RED_FIRST_MARKER = '(red)'

const parseShortstat = ({ line }) => {
  const files = line.match(/(\d+) files? changed/)
  const insertions = line.match(/(\d+) insertions?/)
  const deletions = line.match(/(\d+) deletions?/)
  return {
    files: files === null ? null : Number(files[1]),
    insertions: insertions === null ? null : Number(insertions[1]),
    deletions: deletions === null ? null : Number(deletions[1]),
  }
}

const countByType = ({ commits }) => {
  const counts = commits.reduce((accumulator, commit) => {
    const key = commit.type ?? 'no conventional prefix'
    return { ...accumulator, [key]: (accumulator[key] ?? 0) + 1 }
  }, {})
  return Object.entries(counts)
    .map(([type, count]) => ({ type, count }))
    .toSorted((left, right) =>
      right.count === left.count ? left.type.localeCompare(right.type) : right.count - left.count,
    )
}

export const readHead = () => {
  const [sha, shortSha, date, subject] = gitLines({
    args: ['log', '-1', '--format=%H%n%h%n%cI%n%s'],
  })
  return {
    sha: sha ?? null,
    shortSha: shortSha ?? null,
    date: date ?? null,
    subject: subject ?? null,
    branch: git({ args: ['rev-parse', '--abbrev-ref', 'HEAD'] }).stdout,
  }
}

// A phase's history is the range from the previous phase's branch tip to its
// own. Branches that do not exist yet produce no numbers at all — there is
// nothing to interpolate from.
export const readPhaseHistory = ({ branch, baseRef }) => {
  if (branch === null || !refExists({ ref: branch })) {
    return { branch, exists: false, baseRef }
  }
  if (!refExists({ ref: baseRef })) {
    return { branch, exists: true, baseRef, baseMissing: true }
  }
  const range = `${baseRef}..${branch}`
  const commits = gitLines({
    args: ['log', '--format=%h %cI %s', range],
  }).map((line) => {
    const [, sha, date, subject] = line.match(LOG_LINE)
    return {
      sha,
      date,
      subject,
      type: subject.match(CONVENTIONAL_SUBJECT)?.[1] ?? null,
      redFirst: subject.includes(RED_FIRST_MARKER),
    }
  })
  const diffCommand = ['diff', '--shortstat', `${baseRef}...${branch}`]
  const shortstat = parseShortstat({ line: git({ args: diffCommand }).stdout })
  const authors = gitLines({ args: ['log', '--format=%an', range] })
  return {
    branch,
    exists: true,
    baseRef,
    range,
    diffCommand: `git ${diffCommand.join(' ')}`,
    commitCount: commits.length,
    redFirstCount: commits.filter((commit) => commit.redFirst).length,
    firstDate: commits.at(-1)?.date ?? null,
    lastDate: commits[0]?.date ?? null,
    commits,
    typeCounts: countByType({ commits }),
    authors: [...new Set(authors)],
    ...shortstat,
  }
}
