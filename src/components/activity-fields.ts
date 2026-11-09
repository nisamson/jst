import type { ActivityTextField } from '../storage/activity-model'

export const employerFields: { field: ActivityTextField; label: string; required?: boolean }[] = [
  { field: 'job_title_or_reference', label: 'Job title or reference', required: true },
  { field: 'employer_name', label: 'Employer name', required: true },
  { field: 'employer_address', label: 'Employer address' },
  { field: 'employer_city', label: 'Employer city' },
  { field: 'employer_state', label: 'Employer state' },
  { field: 'employer_website_or_email', label: 'Employer website or email' },
  { field: 'employer_phone', label: 'Employer phone' },
]

export const worksourceFields: { field: ActivityTextField; label: string }[] = [
  { field: 'worksource_office_name', label: 'WorkSource office name' },
  { field: 'worksource_city', label: 'WorkSource city' },
  { field: 'worksource_state', label: 'WorkSource state' },
]
