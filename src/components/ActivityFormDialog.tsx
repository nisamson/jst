import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Alert, Button, Fieldset, Group, Modal, NativeSelect, Stack, Text, Textarea, TextInput } from '@mantine/core'
import { activityKinds, activityWarnings, contactMethods, contactTypes, localCalendarDate, normalizeActivity } from '../storage/activity-model'
import type { Activity, ActivityInput, ActivityKind } from '../storage/activity-model'
import { employerFields, worksourceFields } from './activity-fields'
import EvidenceEditor from './EvidenceEditor'
import { emptyEvidence, validateEvidence } from '../storage/evidence-model'
import type { EvidenceDraft } from '../storage/evidence-model'
import { IconEdit, IconPlus } from '@tabler/icons-react'

export default function ActivityFormDialog({
  activity, initialDate, readOnly, onSave, onClose,
}: {
  activity?: Activity
  initialDate?: string
  readOnly: boolean
  onSave: (input: ActivityInput, evidence: EvidenceDraft) => Promise<void>
  onClose: () => void
}) {
  const [input, setInput] = useState<ActivityInput>(activity ?? { kind: 'employer_contact', activity_date: initialDate ?? localCalendarDate() })
  const [evidence, setEvidence] = useState<EvidenceDraft>(activity?.evidence ?? emptyEvidence())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const busy = useRef(false)
  const dateInput = useRef<HTMLInputElement>(null)
  const warnings = activityWarnings(input, undefined, evidence)
  const title = activity ? 'Edit activity' : 'Add activity'

  function setField(field: keyof ActivityInput, value: string) {
    setInput((current) => ({ ...current, [field]: value }))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current || readOnly) return
    try {
      if (dateInput.current && !dateInput.current.validity.valid) throw new Error('Choose a complete, valid activity date.')
      const normalized = normalizeActivity(input)
      validateEvidence(evidence)
      busy.current = true
      setSaving(true)
      setError(undefined)
      await onSave(normalized, evidence)
    } catch (failure) {
      setError(`${failure instanceof Error ? failure.message : 'The activity could not be saved.'} Your entries are unchanged. Retry when ready.`)
    } finally {
      busy.current = false
      setSaving(false)
    }
  }

  return (
    <Modal opened title={title} onClose={onClose} size="lg" closeOnEscape={!saving} closeOnClickOutside={!saving} withCloseButton={!saving}>
      <form noValidate aria-busy={saving} onSubmit={(event) => void submit(event)}>
        <Stack gap="md">
          <Text size="sm">Your own job-search log. Saving does not establish ESD eligibility or approval.</Text>
          <Fieldset legend="Activity details" px={{ base: 'xs', sm: 'lg' }} disabled={saving || readOnly}>
            <Stack gap="sm">
              <TextInput ref={dateInput} type="date" label="Activity date" required min="0001-01-01" max="9999-12-31"
                value={input.activity_date} onChange={(event) => setField('activity_date', event.currentTarget.value)} />
              <NativeSelect label="Activity kind" required data={[...activityKinds]} value={input.kind}
                onChange={(event) => {
                  const kind = event.currentTarget.value as ActivityKind
                  setInput((current) => ({ activity_date: current.activity_date, kind }))
                }} />
              <Text size="xs" c="dimmed">Changing kind clears the previous kind's fields in this form. Cancel leaves the saved record unchanged.</Text>
              {input.kind === 'employer_contact' ? (
                <>
                  {employerFields.map(({ field, label, required }) => (
                    <TextInput key={field} label={label} required={required} value={input[field] ?? ''}
                      onChange={(event) => setField(field, event.currentTarget.value)} />
                  ))}
                  <Text size="sm">Provide at least one address, website/email, or phone. City and state alone are not enough.</Text>
                  <NativeSelect label="Contact method" required data={[{ value: '', label: 'Choose a contact method' }, ...contactMethods]}
                    value={input.contact_method ?? ''} onChange={(event) => {
                      const method = event.currentTarget.value as ActivityInput['contact_method']
                      setInput((current) => ({ ...current, contact_method: method, contact_method_other: null }))
                    }} />
                  {input.contact_method === 'other' && (
                    <TextInput label="Other contact method" required value={input.contact_method_other ?? ''}
                      onChange={(event) => setField('contact_method_other', event.currentTarget.value)} />
                  )}
                  <NativeSelect label="Contact type" required data={[{ value: '', label: 'Choose a contact type' }, ...contactTypes]}
                    value={input.contact_type ?? ''} onChange={(event) => setField('contact_type', event.currentTarget.value)} />
                </>
              ) : (
                <>
                  <Textarea label="Activity description" required autosize minRows={2} maxRows={6} value={input.activity_description ?? ''}
                    onChange={(event) => setField('activity_description', event.currentTarget.value)} />
                  <Textarea label="Documentation description (optional)" autosize minRows={2} maxRows={6}
                    description="Plain-text notes about supporting evidence, whether attached below or kept outside the app."
                    value={input.documentation_description ?? ''} onChange={(event) => setField('documentation_description', event.currentTarget.value)} />
                  {input.kind === 'worksource_activity' && worksourceFields.map(({ field, label }) => (
                    <TextInput key={field} label={label} value={input[field] ?? ''} onChange={(event) => setField(field, event.currentTarget.value)} />
                  ))}
                </>
              )}
            </Stack>
          </Fieldset>
          <EvidenceEditor value={evidence} onChange={setEvidence} disabled={saving || readOnly} />
          {warnings.map((warning) => <Alert key={warning} color="yellow" role="note">{warning}</Alert>)}
          {readOnly && <Alert color="yellow" title="Profile is read-only">Activity changes are blocked.</Alert>}
          {error && <Alert color="red" title="Activity could not be saved">{error}</Alert>}
          <Group justify="flex-end">
            <Button type="button" variant="default" disabled={saving} onClick={onClose}>Cancel</Button>
            <Button leftSection={activity ? <IconEdit size={16} aria-hidden /> : <IconPlus size={16} aria-hidden />} type="submit" disabled={saving || readOnly}
              loading={saving}>{activity ? 'Save activity' : 'Add activity'}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}
