import { useEffect, useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  BODY_MEASUREMENT_FIELDS,
  BODY_MEASUREMENT_LABELS,
  type BodyMeasurementField,
  type BodyMeasurementLog,
  formatMeasurementValue,
  measurementSeries,
  measurementUnitLabel,
} from '../lib/bodyMeasurements'
import { fetchBodyMeasurementLogs, insertBodyMeasurementLog } from '../lib/supabase'
import { useApexChartColors } from '../lib/stats'

type Props = {
  userId: string
  weightUnit: 'lbs' | 'kg'
  inputClassName: string
  active: boolean
  onWeightLogged?: (value: number) => void
  notify: (message: string) => void
}

type Draft = Record<BodyMeasurementField, string>

const EMPTY_DRAFT: Draft = {
  weight: '',
  chest: '',
  waist: '',
  hips: '',
  arms: '',
  thighs: '',
}

function parseDraftField(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const n = Number(trimmed)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

export function BodyMeasurementsSection({
  userId,
  weightUnit,
  inputClassName,
  active,
  onWeightLogged,
  notify,
}: Props) {
  const chart = useApexChartColors()
  const [logs, setLogs] = useState<BodyMeasurementLog[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [chartField, setChartField] = useState<BodyMeasurementField>('weight')

  useEffect(() => {
    if (!active || !userId) return
    let cancelled = false
    setLoading(true)
    void fetchBodyMeasurementLogs(userId)
      .then((rows) => {
        if (!cancelled) {
          setLogs(rows)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLogs([])
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [active, userId])

  const chartData = useMemo(
    () => measurementSeries(logs, chartField),
    [logs, chartField],
  )

  const latestForField = useMemo(() => {
    const series = measurementSeries(logs, chartField)
    return series.length ? series[series.length - 1]! : null
  }, [logs, chartField])

  async function handleSave() {
    const input = {
      weight: parseDraftField(draft.weight),
      chest: parseDraftField(draft.chest),
      waist: parseDraftField(draft.waist),
      hips: parseDraftField(draft.hips),
      arms: parseDraftField(draft.arms),
      thighs: parseDraftField(draft.thighs),
    }

    if (
      input.weight == null &&
      input.chest == null &&
      input.waist == null &&
      input.hips == null &&
      input.arms == null &&
      input.thighs == null
    ) {
      notify('Enter at least one measurement')
      return
    }

    setSaving(true)
    try {
      const row = await insertBodyMeasurementLog(userId, input, weightUnit)
      setLogs((prev) => [...prev, row])
      setDraft(EMPTY_DRAFT)
      if (input.weight != null) onWeightLogged?.(input.weight)
      notify('Measurements saved')
    } catch {
      notify('Could not save measurements')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="apex-card p-5 space-y-4">
      <div>
        <p className="apex-section-label">Body measurements</p>
        <p className="mt-1 text-[12px] font-medium text-[#a0a0a8] leading-relaxed">
          Log weight ({weightUnit}) and circumferences (in). History syncs to your account.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {BODY_MEASUREMENT_FIELDS.map((field) => (
          <label key={field} className="block min-w-0">
            <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-[#7d7d88] block mb-1">
              {BODY_MEASUREMENT_LABELS[field]} ({measurementUnitLabel(field, weightUnit)})
            </span>
            <input
              inputMode="decimal"
              className={`w-full min-h-10 ${inputClassName}`}
              placeholder="—"
              value={draft[field]}
              onChange={(e) => setDraft((d) => ({ ...d, [field]: e.target.value }))}
            />
          </label>
        ))}
      </div>

      <button
        type="button"
        className="apex-btn-primary w-full min-h-11 text-[13px] font-medium rounded-[8px]  disabled:opacity-50"
        disabled={saving}
        onClick={() => void handleSave()}
      >
        {saving ? 'Saving…' : 'Save measurements'}
      </button>

      <div className="pt-1 border-t border-white/[0.06]">
        <p className="text-[0.8125rem] font-medium text-[#7d7d88] mb-2">History</p>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {BODY_MEASUREMENT_FIELDS.map((field) => {
            const on = chartField === field
            const count = measurementSeries(logs, field).length
            return (
              <button
                key={field}
                type="button"
                className={`min-h-9 px-3 rounded-full text-[11px] font-medium transition-colors touch-manipulation ${
                  on ? 'apex-accent-pill-active' : 'border-[0.5px] border-white/[0.12] text-[#a0a0a8]'
                }`}
                onClick={() => setChartField(field)}
              >
                {BODY_MEASUREMENT_LABELS[field]}
                {count > 0 ? ` · ${count}` : ''}
              </button>
            )
          })}
        </div>

        {loading ? (
          <p className="text-[13px] font-medium text-[#7d7d88] py-8 text-center">Loading…</p>
        ) : chartData.length === 0 ? (
          <p className="text-[13px] font-medium text-[#7d7d88] py-8 text-center">
            No {BODY_MEASUREMENT_LABELS[chartField].toLowerCase()} entries yet
          </p>
        ) : (
          <>
            {latestForField ? (
              <p className="text-[12px] font-medium text-[#a0a0a8] mb-2 tabular-nums">
                Latest: {formatMeasurementValue(chartField, latestForField.value, weightUnit)} ·{' '}
                {latestForField.at}
              </p>
            ) : null}
            <div className="h-44 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid stroke={chart.grid} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="at"
                    stroke={chart.tick}
                    tick={{ fill: chart.tick, fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke={chart.tick}
                    tick={{ fill: chart.tick, fontSize: 10 }}
                    width={36}
                    tickLine={false}
                    axisLine={false}
                    domain={['auto', 'auto']}
                  />
                  <Tooltip
                    contentStyle={{
                      background: chart.tooltipBg,
                      border: `0.5px solid ${chart.tooltipBorder}`,
                    }}
                    labelStyle={{ color: chart.tooltipText }}
                    itemStyle={{ color: chart.tooltipText }}
                    formatter={(value) => {
                      const n = typeof value === 'number' ? value : Number(value)
                      if (!Number.isFinite(n)) return ''
                      return formatMeasurementValue(chartField, n, weightUnit)
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke={chart.line}
                    dot={{ r: 2, fill: chart.line }}
                    strokeWidth={1.5}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
