import { escapeHtml, round } from './text.mjs'

// Inline SVG charts, no library. Every chart carries a <title>, a <desc> and a
// data table, because a chart a screen reader cannot read is decoration — and a
// category with no measurement is drawn as an empty slot labelled "no data",
// never as a zero.

const CHART_WIDTH = 780
const PLOT_LEFT = 46
const PLOT_RIGHT = 14
const PLOT_TOP = 14
const AXIS_HEIGHT = 34
const TICK_FONT_SIZE = 10
const CATEGORY_FONT_SIZE = 11
const BAR_GAP = 3
const SERIES_CLASS_COUNT = 5

const seriesClass = ({ index }) => `ch-s${(index % SERIES_CLASS_COUNT) + 1}`

const yTicks = ({ maximum, count }) =>
  Array.from({ length: count + 1 }, (_unused, index) => (maximum / count) * index)

const axisAndGrid = ({ plot, maximum, tickCount, valueSuffix }) => {
  const ticks = yTicks({ maximum, count: tickCount })
  return ticks
    .map((tick) => {
      const y = plot.top + plot.height - (tick / maximum) * plot.height
      return [
        `<line class="ch-grid" x1="${plot.left}" y1="${round({ value: y })}" x2="${round({ value: plot.left + plot.width })}" y2="${round({ value: y })}"/>`,
        `<text class="ch-tick" x="${plot.left - 6}" y="${round({ value: y + TICK_FONT_SIZE * 0.35 })}" text-anchor="end">${round({ value: tick })}${valueSuffix}</text>`,
      ].join('')
    })
    .join('')
}

const categoryLabels = ({ plot, categories }) =>
  categories
    .map((category, index) => {
      const slot = plot.width / categories.length
      const x = plot.left + slot * index + slot / 2
      return `<text class="ch-category" x="${round({ value: x })}" y="${round({ value: plot.top + plot.height + CATEGORY_FONT_SIZE + 8 })}" text-anchor="middle">${escapeHtml({ value: category.label })}</text>`
    })
    .join('')

const emptySlots = ({ plot, categories }) =>
  categories
    .map((category, index) => {
      if (!category.empty) return ''
      const slot = plot.width / categories.length
      const x = plot.left + slot * index + slot * 0.12
      const width = slot * 0.76
      return [
        `<rect class="ch-empty" x="${round({ value: x })}" y="${plot.top}" width="${round({ value: width })}" height="${round({ value: plot.height })}"/>`,
        `<text class="ch-empty-text" x="${round({ value: x + width / 2 })}" y="${round({ value: plot.top + plot.height / 2 })}" text-anchor="middle">no data</text>`,
      ].join('')
    })
    .join('')

const legend = ({ series }) =>
  `<ul class="ch-legend">${series
    .map(
      (entry, index) =>
        `<li><span class="ch-swatch ${seriesClass({ index })}"></span>${escapeHtml({ value: entry.label })}</li>`,
    )
    .join('')}</ul>`

const dataTable = ({ categories, series, valueOf, valueSuffix }) => {
  const header = ['', ...series.map((entry) => escapeHtml({ value: entry.label }))]
  const rows = categories.map((category, categoryIndex) => {
    const cells = series.map((entry, seriesIndex) => {
      const value = valueOf({ categoryIndex, seriesIndex })
      return `<td>${value === null ? '—' : `${escapeHtml({ value: String(value) })}${valueSuffix}`}</td>`
    })
    return `<tr><th scope="row">${escapeHtml({ value: category.label })}</th>${cells.join('')}</tr>`
  })
  return `<details class="src"><summary>Data table (text alternative)</summary><div class="table-wrap"><table><thead><tr>${header
    .map((cell) => `<th>${cell}</th>`)
    .join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div></details>`
}

const chartFrame = ({ id, title, description, height, body, series, footnote, table }) =>
  [
    '<figure class="chart">',
    `<svg role="img" aria-labelledby="ch-title-${id}" aria-describedby="ch-desc-${id}" viewBox="0 0 ${CHART_WIDTH} ${height}" width="${CHART_WIDTH}" height="${height}">`,
    `<title id="ch-title-${id}">${escapeHtml({ value: title })}</title>`,
    `<desc id="ch-desc-${id}">${escapeHtml({ value: description })}</desc>`,
    body,
    '</svg>',
    series === null ? '' : legend({ series }),
    `<figcaption>${escapeHtml({ value: title })}${footnote === undefined ? '' : ` · <span class="muted">${escapeHtml({ value: footnote })}</span>`}</figcaption>`,
    table,
    '</figure>',
  ].join('')

export const renderGroupedBars = ({
  id,
  title,
  description,
  footnote,
  categories,
  series,
  values,
  maximum,
  tickCount,
  valueSuffix,
  reference,
}) => {
  const plotHeight = 210
  const height = plotHeight + PLOT_TOP + AXIS_HEIGHT
  const plot = {
    left: PLOT_LEFT,
    top: PLOT_TOP,
    width: CHART_WIDTH - PLOT_LEFT - PLOT_RIGHT,
    height: plotHeight,
  }
  const slot = plot.width / categories.length
  const bars = categories.flatMap((category, categoryIndex) =>
    series.map((entry, seriesIndex) => {
      const value = values[categoryIndex]?.[seriesIndex] ?? null
      if (value === null) return ''
      const barWidth = (slot * 0.76) / series.length - BAR_GAP
      const x = plot.left + slot * categoryIndex + slot * 0.12 + (barWidth + BAR_GAP) * seriesIndex
      const barHeight = (value / maximum) * plot.height
      return `<rect class="ch-bar ${seriesClass({ index: seriesIndex })}" x="${round({ value: x })}" y="${round({ value: plot.top + plot.height - barHeight })}" width="${round({ value: barWidth })}" height="${round({ value: barHeight })}"><title>${escapeHtml({ value: `${category.label} · ${entry.label}: ${value}${valueSuffix}` })}</title></rect>`
    }),
  )
  const referenceLine =
    reference === undefined
      ? ''
      : [
          `<line class="ch-reference" x1="${plot.left}" y1="${round({ value: plot.top + plot.height - (reference.value / maximum) * plot.height })}" x2="${round({ value: plot.left + plot.width })}" y2="${round({ value: plot.top + plot.height - (reference.value / maximum) * plot.height })}"/>`,
          `<text class="ch-reference-text" x="${round({ value: plot.left + plot.width })}" y="${round({ value: plot.top + plot.height - (reference.value / maximum) * plot.height - 5 })}" text-anchor="end">${escapeHtml({ value: reference.label })}</text>`,
        ].join('')
  return chartFrame({
    id,
    title,
    description,
    height,
    series,
    footnote,
    body: [
      axisAndGrid({ plot, maximum, tickCount, valueSuffix }),
      emptySlots({ plot, categories }),
      bars.join(''),
      referenceLine,
      categoryLabels({ plot, categories }),
    ].join(''),
    table: dataTable({
      categories,
      series,
      valueSuffix,
      valueOf: ({ categoryIndex, seriesIndex }) => values[categoryIndex]?.[seriesIndex] ?? null,
    }),
  })
}

export const renderStackedBars = ({
  id,
  title,
  description,
  footnote,
  categories,
  series,
  values,
  maximum,
  tickCount,
  valueSuffix,
}) => {
  const plotHeight = 210
  const height = plotHeight + PLOT_TOP + AXIS_HEIGHT
  const plot = {
    left: PLOT_LEFT,
    top: PLOT_TOP,
    width: CHART_WIDTH - PLOT_LEFT - PLOT_RIGHT,
    height: plotHeight,
  }
  const slot = plot.width / categories.length
  const columns = categories.map((category, categoryIndex) => {
    const barWidth = slot * 0.5
    const x = plot.left + slot * categoryIndex + (slot - barWidth) / 2
    const stack = series.reduce(
      (accumulator, entry, seriesIndex) => {
        const value = values[categoryIndex]?.[seriesIndex] ?? null
        if (value === null) return accumulator
        const segmentHeight = (value / maximum) * plot.height
        const y = plot.top + plot.height - accumulator.offset - segmentHeight
        return {
          offset: accumulator.offset + segmentHeight,
          total: accumulator.total + value,
          html: `${accumulator.html}<rect class="ch-bar ${seriesClass({ index: seriesIndex })}" x="${round({ value: x })}" y="${round({ value: y })}" width="${round({ value: barWidth })}" height="${round({ value: segmentHeight })}"><title>${escapeHtml({ value: `${category.label} · ${entry.label}: ${value}${valueSuffix}` })}</title></rect>`,
        }
      },
      { offset: 0, total: 0, html: '' },
    )
    if (stack.total === 0) return ''
    return `${stack.html}<text class="ch-value" x="${round({ value: x + barWidth / 2 })}" y="${round({ value: plot.top + plot.height - stack.offset - 6 })}" text-anchor="middle">${stack.total}${valueSuffix}</text>`
  })
  return chartFrame({
    id,
    title,
    description,
    height,
    series,
    footnote,
    body: [
      axisAndGrid({ plot, maximum, tickCount, valueSuffix }),
      emptySlots({ plot, categories }),
      columns.join(''),
      categoryLabels({ plot, categories }),
    ].join(''),
    table: dataTable({
      categories,
      series,
      valueSuffix,
      valueOf: ({ categoryIndex, seriesIndex }) => values[categoryIndex]?.[seriesIndex] ?? null,
    }),
  })
}

const HORIZONTAL_ROW_HEIGHT = 22
const HORIZONTAL_LABEL_WIDTH = 118

export const renderHorizontalBars = ({ id, title, description, footnote, rows, valueSuffix }) => {
  const maximum = rows.reduce((biggest, row) => Math.max(biggest, row.value), 0)
  const height = rows.length * HORIZONTAL_ROW_HEIGHT + PLOT_TOP * 2
  const barArea = CHART_WIDTH - HORIZONTAL_LABEL_WIDTH - 60
  const bars = rows
    .map((row, index) => {
      const y = PLOT_TOP + index * HORIZONTAL_ROW_HEIGHT
      const width = maximum === 0 ? 0 : (row.value / maximum) * barArea
      return [
        `<text class="ch-category" x="${HORIZONTAL_LABEL_WIDTH - 8}" y="${round({ value: y + HORIZONTAL_ROW_HEIGHT / 2 + 4 })}" text-anchor="end">${escapeHtml({ value: row.label })}</text>`,
        `<rect class="ch-bar ${seriesClass({ index })}" x="${HORIZONTAL_LABEL_WIDTH}" y="${round({ value: y + 4 })}" width="${round({ value: width })}" height="${HORIZONTAL_ROW_HEIGHT - 9}"><title>${escapeHtml({ value: `${row.label}: ${row.value}${valueSuffix}` })}</title></rect>`,
        `<text class="ch-value" x="${round({ value: HORIZONTAL_LABEL_WIDTH + width + 6 })}" y="${round({ value: y + HORIZONTAL_ROW_HEIGHT / 2 + 4 })}">${row.value}${valueSuffix}</text>`,
      ].join('')
    })
    .join('')
  return chartFrame({
    id,
    title,
    description,
    height,
    series: null,
    footnote,
    body: bars,
    table: dataTable({
      categories: rows.map((row) => ({ label: row.label })),
      series: [{ label: title }],
      valueSuffix,
      valueOf: ({ categoryIndex }) => rows[categoryIndex].value,
    }),
  })
}
