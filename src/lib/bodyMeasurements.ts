import { dateKey } from './dates'

export const BODY_MEASUREMENT_FIELDS = [
  'weight',
  'chest',
  'waist',
  'hips',
  'arms',
  'thighs',
] as const

export type BodyMeasurementField = (typeof BODY_MEASUREMENT_FIELDS)[number]

export type BodyMeasurementLog = {
  id: string
  user_id: string
  date_key: string
  weight: number | null
  chest: number | null
  waist: number | null
  hips: number | null
  arms: number | null
  thighs: number | null
  weight_unit: string
  circumference_unit: string
  created_at: string
}

export type BodyMeasurementInput = {
  weight?: number | null
  chest?: number | null
  waist?: number | null
  hips?: number | null
  arms?: number | null
  thighs?: number | null
}

export const BODY_MEASUREMENT_LABELS: Record<BodyMeasurementField, string> = {
  weight: 'Weight',
  chest: 'Chest',
  waist: 'Waist',
  hips: 'Hips',
  arms: 'Arms',
  thighs: 'Thighs',
}

export function hasAnyBodyMeasurement(input: BodyMeasurementInput): boolean {
  return BODY_MEASUREMENT_FIELDS.some((field) => {
    const v = input[field]
    return v != null && Number.isFinite(v) && v > 0
  })
}

export function measurementSeries(
  logs: BodyMeasurementLog[],
  field: BodyMeasurementField,
): { at: string; value: number }[] {
  return [...logs]
    .filter((log) => {
      const v = log[field]
      return v != null && Number.isFinite(v) && v > 0
    })
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
    .map((log) => ({
      at: log.date_key,
      value: log[field] as number,
    }))
}

export function measurementUnitLabel(
  field: BodyMeasurementField,
  weightUnit: 'lbs' | 'kg',
  circumferenceUnit = 'in',
): string {
  return field === 'weight' ? weightUnit : circumferenceUnit
}

export function formatMeasurementValue(
  field: BodyMeasurementField,
  value: number,
  weightUnit: 'lbs' | 'kg',
): string {
  const unit = measurementUnitLabel(field, weightUnit)
  const rounded = field === 'weight' ? Math.round(value * 10) / 10 : Math.round(value * 10) / 10
  return `${rounded} ${unit}`
}

export function todayMeasurementDateKey(): string {
  return dateKey(new Date())
}
