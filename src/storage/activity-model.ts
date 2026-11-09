import { isCalendarDate } from './calendar-date'

export const activityKinds = [
  { value: 'employer_contact', label: 'Employer contact' },
  { value: 'worksource_activity', label: 'WorkSource activity' },
  { value: 'other_activity', label: 'Other activity' },
] as const

export const contactMethods = [
  { value: 'in_person', label: 'In-person' },
  { value: 'online', label: 'Online' },
  { value: 'phone', label: 'By phone' },
  { value: 'email', label: 'By email' },
  { value: 'mail', label: 'By mail' },
  { value: 'other', label: 'Other' },
] as const

export const contactTypes = [
  { value: 'application_resume', label: 'Application/resume' },
  { value: 'interview', label: 'Interview' },
  { value: 'inquiry', label: 'Inquiry' },
] as const

export const activityTextFields = [
  'job_title_or_reference', 'employer_name', 'contact_method_other',
  'employer_address', 'employer_city', 'employer_state', 'employer_website_or_email', 'employer_phone',
  'activity_description', 'documentation_description', 'worksource_office_name', 'worksource_city', 'worksource_state',
] as const

export type ActivityKind = typeof activityKinds[number]['value']
export type ActivityTextField = typeof activityTextFields[number]
export type ActivityInput = {
  activity_date: string
  kind: ActivityKind
  contact_method?: typeof contactMethods[number]['value'] | null
  contact_type?: typeof contactTypes[number]['value'] | null
} & Partial<Record<ActivityTextField, string | null>>

export type ActivityDetails = {
  activity_date: string
  kind: ActivityKind
  contact_method: NonNullable<ActivityInput['contact_method']> | null
  contact_type: NonNullable<ActivityInput['contact_type']> | null
} & Record<ActivityTextField, string | null>

export type Activity = ActivityDetails & {
  id: string
  claim_id: string
  created_at: string
  updated_at: string
}

export function normalizeActivity(input: ActivityInput): ActivityDetails {
  if (!activityKinds.some((item) => item.value === input.kind)) throw new Error('Choose a supported activity kind.')
  const date = input.activity_date.trim()
  if (!isCalendarDate(date)) throw new Error('Choose a real activity date.')

  const details = Object.fromEntries(activityTextFields.map((field) => [field, null])) as Record<ActivityTextField, string | null>
  const applicable: ActivityTextField[] = input.kind === 'employer_contact'
    ? ['job_title_or_reference', 'employer_name', 'contact_method_other', 'employer_address',
      'employer_city', 'employer_state', 'employer_website_or_email', 'employer_phone']
    : input.kind === 'worksource_activity'
      ? ['activity_description', 'documentation_description', 'worksource_office_name', 'worksource_city', 'worksource_state']
      : ['activity_description', 'documentation_description']
  for (const field of applicable) details[field] = input[field]?.trim() || null

  let method: ActivityInput['contact_method'] = null
  let type: ActivityInput['contact_type'] = null
  if (input.kind === 'employer_contact') {
    if (!details.job_title_or_reference || !details.employer_name) {
      throw new Error('Enter a job title or reference and an employer name.')
    }
    if (!contactMethods.some((item) => item.value === input.contact_method)) throw new Error('Choose a contact method.')
    if (!contactTypes.some((item) => item.value === input.contact_type)) throw new Error('Choose a contact type.')
    method = input.contact_method ?? null
    type = input.contact_type ?? null
    if (method === 'other' && !details.contact_method_other) throw new Error('Describe the other contact method.')
    if (method !== 'other') details.contact_method_other = null
    if (!details.employer_address && !details.employer_website_or_email && !details.employer_phone) {
      throw new Error('Enter at least one employer address, website/email, or phone number. City and state alone are not enough.')
    }
  } else if (!details.activity_description) {
    throw new Error('Describe the activity you completed.')
  }
  return { ...details, activity_date: date, kind: input.kind, contact_method: method, contact_type: type }
}

export function localCalendarDate(now = new Date()) {
  return `${String(now.getFullYear()).padStart(4, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function activityWarnings(input: ActivityInput, today = localCalendarDate()) {
  const warnings: string[] = []
  if (isCalendarDate(input.activity_date) && input.activity_date > today) {
    warnings.push('This activity date is in the future. You can still save it; review that it is the date you intended.')
  }
  if (input.kind !== 'employer_contact' && !input.documentation_description?.trim()) {
    warnings.push('Consider retaining supporting evidence. No documentation description is recorded here; evidence may exist outside the app.')
  }
  return warnings
}

export function activityTitle(activity: ActivityInput) {
  return activity.kind === 'employer_contact'
    ? `${activity.employer_name ?? ''} - ${activity.job_title_or_reference ?? ''}`
    : activity.activity_description ?? ''
}
