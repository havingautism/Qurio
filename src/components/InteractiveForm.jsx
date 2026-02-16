import clsx from 'clsx'
import Check from 'lucide-react/dist/esm/icons/check'
import ChevronDown from 'lucide-react/dist/esm/icons/chevron-down'
import React, { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Custom Select Component
 */
const CustomSelect = ({ value, onChange, options, placeholder, disabled, error }) => {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = event => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = option => {
    if (disabled) return
    onChange(option)
    setIsOpen(false)
  }

  return (
    <div className="relative" ref={containerRef}>
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={clsx(
          'w-full cursor-pointer rounded-xl border border-gray-200 py-2.5 pr-10 pl-4 transition-all duration-300 dark:border-white/10',
          'flex items-center justify-between',
          'bg-gray-50/50 backdrop-blur-md hover:bg-white dark:bg-zinc-900/50 dark:hover:bg-zinc-800',
          isOpen
            ? 'ring-primary-500/20 border-primary-500/50 shadow-primary-500/5 shadow-lg ring-2'
            : 'hover:border-gray-200 dark:hover:border-white/10',
          disabled && 'cursor-not-allowed opacity-60',
          error && 'border-red-500/50! bg-red-50/10! shadow-none',
        )}
      >
        <span
          className={clsx(
            'truncate text-sm font-medium',
            value ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400',
          )}
        >
          {value || placeholder}
        </span>
        <div
          className={clsx(
            'absolute right-3.5 text-gray-400 transition-transform duration-300',
            isOpen && 'rotate-180',
          )}
        >
          <ChevronDown size={18} strokeWidth={2.5} />
        </div>
      </div>

      {/* Dropdown Menu */}
      <div
        className={clsx(
          'absolute z-60 mt-2 w-full overflow-hidden rounded-xl border border-gray-100 py-1.5 shadow-2xl dark:border-white/10',
          'origin-top bg-white transition-all duration-200 dark:bg-zinc-900',
          isOpen
            ? 'translate-y-0 scale-100 opacity-100'
            : 'pointer-events-none -translate-y-2 scale-95 opacity-0',
        )}
      >
        <div className="scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-white/10 max-h-[300px] overflow-y-auto px-1.5">
          {options.map(opt => (
            <div
              key={opt}
              onClick={() => handleSelect(opt)}
              className={clsx(
                'group my-0.5 flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200',
                value === opt
                  ? 'bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200',
              )}
            >
              <span>{opt}</span>
              {value === opt && (
                <Check
                  size={16}
                  className="text-primary-500 animate-in zoom-in spin-in-90 duration-300"
                  strokeWidth={3}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * InteractiveForm Component
 * Renders dynamic forms based on AI-generated JSON definitions
 */
const InteractiveForm = ({
  formData,
  onSubmit,
  messageId,
  isSubmitted = false,
  submittedValues = {},
  developerMode = false,
  onShowDetails = null,
}) => {
  const [values, setValues] = useState({})
  const [errors, setErrors] = useState({})
  const { t } = useTranslation()

  /**
   * Defensive JSON repair utility for stringified or malformed fields
   */
  const repairAndParseFields = React.useCallback(input => {
    if (Array.isArray(input)) return input
    if (typeof input !== 'string') return []

    let repaired = input.trim()
    // Handle common syntax errors like "key": ,
    repaired = repaired.replace(/:\s*,/g, ': null,').replace(/:\s*}/g, ': null}')
    // Handle trailing commas
    repaired = repaired.replace(/,\s*]/g, ']').replace(/,\s*}/g, '}')

    try {
      const parsed = JSON.parse(repaired)
      return Array.isArray(parsed) ? parsed : []
    } catch (e) {
      console.warn('Failed to parse fields:', e)
      return []
    }
  }, [])

  // filter out malformed fields
  const validFields = React.useMemo(() => {
    const rawFields = repairAndParseFields(formData.fields)
    return rawFields.filter(f => f && f.name && f.label && f.type)
  }, [formData.fields, repairAndParseFields])

  // Initialize values
  const formDataString = JSON.stringify(formData)
  const submittedValuesString = JSON.stringify(submittedValues)

  React.useEffect(() => {
    const initialValues = {}
    validFields.forEach(field => {
      const hasCheckboxOptions =
        field.type === 'checkbox' && Array.isArray(field.options) && field.options.length > 0
      // Direct lookup in submittedValues (which is the tool output object)
      const submittedValue = submittedValues[field.name] ?? submittedValues[field.label]

      if (submittedValue !== undefined) {
        if (field.type === 'checkbox') {
          if (hasCheckboxOptions) {
            initialValues[field.name] = Array.isArray(submittedValue)
              ? submittedValue
              : typeof submittedValue === 'string'
                ? submittedValue
                    .split(',')
                    .map(v => v.trim())
                    .filter(Boolean)
                : [submittedValue]
          } else {
            if (typeof submittedValue === 'boolean') {
              initialValues[field.name] = submittedValue
            } else if (typeof submittedValue === 'string') {
              initialValues[field.name] = ['true', '1', 'yes', 'on'].includes(
                submittedValue.trim().toLowerCase(),
              )
            } else {
              initialValues[field.name] = Boolean(submittedValue)
            }
          }
        } else if (field.type === 'number' || field.type === 'range') {
          initialValues[field.name] = Number(submittedValue)
        } else {
          initialValues[field.name] = submittedValue
        }
      } else {
        if (field.type === 'checkbox') {
          initialValues[field.name] = hasCheckboxOptions ? [] : false
        } else if (field.type === 'range' && field.default !== undefined) {
          initialValues[field.name] = field.default
        } else {
          initialValues[field.name] = ''
        }
      }
    })
    setValues(initialValues)
  }, [formDataString, submittedValuesString])

  const validate = () => {
    const newErrors = {}
    validFields.forEach(field => {
      if (field.required) {
        const value = values[field.name]
        if (field.type === 'checkbox') {
          const hasCheckboxOptions = Array.isArray(field.options) && field.options.length > 0
          const isValid = hasCheckboxOptions
            ? Array.isArray(value) && value.length > 0
            : value === true
          if (!isValid) {
            newErrors[field.name] = t('tools.interactiveFormStrings.requiredError')
          }
        } else if (!value || (Array.isArray(value) && value.length === 0)) {
          newErrors[field.name] = t('tools.interactiveFormStrings.requiredError')
        }
      }
    })
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = e => {
    e.preventDefault()
    if (validate() && !isSubmitted) {
      onSubmit({ formId: formData.id, values, messageId })
    }
  }

  const updateValue = (name, value) => {
    setValues(prev => ({ ...prev, [name]: value }))
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: undefined }))
  }

  const toggleCheckbox = (name, option) => {
    if (typeof option === 'undefined') {
      setValues(prev => ({ ...prev, [name]: !prev[name] }))
      if (errors[name]) setErrors(prev => ({ ...prev, [name]: undefined }))
      return
    }
    setValues(prev => {
      const current = prev[name] || []
      const newValue = current.includes(option)
        ? current.filter(v => v !== option)
        : [...current, option]
      return { ...prev, [name]: newValue }
    })
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: undefined }))
  }

  return (
    <div className="relative z-30 mx-auto mb-3 w-full max-w-2xl">
      <div className="group relative mb-3 rounded-3xl border border-gray-200 bg-white/80 p-4 shadow-xl shadow-gray-200/50 backdrop-blur-xl transition-all duration-300 md:p-6 dark:border-white/10 dark:bg-black/40 dark:shadow-black/50">
        {/* Decorative Background Gradients */}
        {/* <div className="absolute -top-20 -right-20 w-60 h-60 bg-primary-500/10 rounded-full blur-[80px] group-hover:bg-primary-500/15 transition-colors duration-700 pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-60 h-60 bg-orange-500/10 rounded-full blur-[80px] group-hover:bg-orange-500/15 transition-colors duration-700 pointer-events-none" /> */}
        {developerMode && (
          <button
            type="button"
            onClick={onShowDetails}
            className="text-primary-600 dark:text-primary-300 absolute top-6 right-6 z-20 text-[10px] font-medium hover:underline"
          >
            {t('messageBubble.toolDetails')}
          </button>
        )}

        <div className="relative z-10">
          {/* Header */}
          <div className="mb-8">
            {formData.title && (
              <h4 className="mb-3 bg-linear-to-br from-gray-900 to-gray-600 bg-clip-text text-xl font-bold text-transparent md:text-2xl dark:from-white dark:to-gray-400">
                {formData.title}
              </h4>
            )}
            {formData.description && (
              <p className="text-sm leading-relaxed font-medium text-gray-500 md:text-base dark:text-gray-400">
                {formData.description}
              </p>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {validFields.length === 0 && (
              <div className="rounded-3xl border-2 border-dashed border-gray-200 py-8 text-center dark:border-white/5">
                <p className="text-sm font-medium text-gray-400">
                  {t('tools.interactiveFormStrings.invalidData')}
                </p>
              </div>
            )}
            {validFields.map((field, idx) => (
              <div
                key={field.name || `field-${idx}`}
                className="animate-in slide-in-from-bottom-2 fade-in space-y-2.5 duration-500"
                style={{ animationDelay: `${idx * 50}ms` }}
              >
                <label className="ml-1 block text-xs font-bold tracking-wider text-gray-600 uppercase dark:text-gray-400">
                  {field.label}
                  {field.required && <span className="text-primary-500 ml-0.5">*</span>}
                </label>

                {/* Custom Select */}
                {field.type === 'select' && (
                  <CustomSelect
                    value={values[field.name]}
                    onChange={val => updateValue(field.name, val)}
                    options={field.options}
                    placeholder={t('tools.interactiveFormStrings.selectPlaceholder')}
                    disabled={isSubmitted}
                    error={errors[field.name]}
                  />
                )}

                {/* Checkbox Group */}
                {field.type === 'checkbox' &&
                  (() => {
                    const hasCheckboxOptions =
                      Array.isArray(field.options) && field.options.length > 0
                    if (hasCheckboxOptions) {
                      return (
                        <div className="flex flex-wrap gap-2">
                          {field.options?.map(opt => {
                            const isChecked = (values[field.name] || []).includes(opt)
                            return (
                              <label
                                key={opt}
                                className={clsx(
                                  'group/item relative cursor-pointer overflow-hidden rounded-lg border px-3 py-2 transition-all duration-300 select-none',
                                  isChecked
                                    ? 'bg-primary-500 border-primary-500 shadow-primary-500/25 scale-[1.02] text-white shadow-lg'
                                    : 'border-transparent bg-gray-50 text-gray-600 hover:border-gray-200 hover:bg-white dark:bg-zinc-900/40 dark:text-gray-400 dark:hover:border-white/10 dark:hover:bg-zinc-800',
                                  isSubmitted &&
                                    'pointer-events-none cursor-not-allowed opacity-60',
                                )}
                              >
                                <input
                                  type="checkbox"
                                  className="hidden"
                                  checked={isChecked}
                                  onChange={() => !isSubmitted && toggleCheckbox(field.name, opt)}
                                  disabled={isSubmitted}
                                />
                                <span className="relative z-10 flex items-center gap-2 text-sm font-medium">
                                  {isChecked && <Check size={14} strokeWidth={3} />}
                                  {opt}
                                </span>
                              </label>
                            )
                          })}
                        </div>
                      )
                    }

                    // const isChecked = values[field.name] === true
                    return (
                      <div className="mt-1 flex w-full rounded-xl bg-gray-100 p-1.5 dark:bg-zinc-800/50">
                        <button
                          type="button"
                          onClick={() => !isSubmitted && updateValue(field.name, true)}
                          disabled={isSubmitted}
                          className={clsx(
                            'flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-300',
                            values[field.name] === true
                              ? 'bg-white text-gray-900 shadow-sm dark:bg-zinc-600 dark:text-white'
                              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200',
                            isSubmitted && 'cursor-not-allowed opacity-60',
                          )}
                        >
                          {t('common.yes')}
                        </button>
                        <button
                          type="button"
                          onClick={() => !isSubmitted && updateValue(field.name, false)}
                          disabled={isSubmitted}
                          className={clsx(
                            'flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-300',
                            values[field.name] === false
                              ? 'bg-white text-gray-900 shadow-sm dark:bg-zinc-600 dark:text-white'
                              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200',
                            isSubmitted && 'cursor-not-allowed opacity-60',
                          )}
                        >
                          {t('common.no')}
                        </button>
                      </div>
                    )
                  })()}

                {/* Inputs */}
                {(field.type === 'text' || field.type === 'number') && (
                  <div className="group/input relative">
                    <input
                      type={field.type}
                      value={values[field.name] || ''}
                      onChange={e => updateValue(field.name, e.target.value)}
                      placeholder={field.placeholder}
                      disabled={isSubmitted}
                      min={field.min}
                      max={field.max}
                      step={field.step}
                      className={clsx(
                        'w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium transition-all duration-300 outline-none dark:border-white/10',
                        'border bg-gray-50/50 backdrop-blur-sm dark:bg-zinc-900/40',
                        isSubmitted
                          ? 'cursor-not-allowed opacity-60'
                          : 'focus:border-primary-500/50 focus:ring-primary-500/10 focus:shadow-primary-500/5 hover:border-gray-200 hover:bg-white focus:bg-white focus:shadow-lg focus:ring-4 dark:hover:border-white/10 dark:hover:bg-zinc-800 dark:focus:bg-black',
                        errors[field.name] && 'border-red-500/50! bg-red-50/10! shadow-none!',
                      )}
                    />
                  </div>
                )}

                {/* Range Slider */}
                {field.type === 'range' && (
                  <div className="rounded-2xl border border-gray-200 bg-gray-50/50 px-1 py-4 transition-colors hover:border-gray-200 dark:border-white/10 dark:bg-zinc-900/40 dark:hover:border-white/10">
                    <div className="px-4">
                      <input
                        type="range"
                        value={values[field.name] || field.min || 0}
                        onChange={e => updateValue(field.name, Number(e.target.value))}
                        min={field.min || 0}
                        max={field.max || 100}
                        step={field.step || 1}
                        disabled={isSubmitted}
                        className={clsx(
                          'accent-primary-500 h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 dark:bg-zinc-700',
                          isSubmitted && 'cursor-not-allowed opacity-60',
                        )}
                      />
                    </div>
                    <div className="mt-3 flex items-center justify-between px-4 font-mono text-xs font-medium text-gray-400">
                      <span>{field.min || 0}</span>
                      <span className="text-primary-600 dark:text-primary-400 rounded-md bg-white px-2.5 py-1 shadow-sm dark:bg-white/10">
                        {values[field.name] || field.min || 0}
                        {field.unit && (
                          <span className="ml-0.5 text-[10px] opacity-70">{field.unit}</span>
                        )}
                      </span>
                      <span>{field.max || 100}</span>
                    </div>
                  </div>
                )}

                {errors[field.name] && (
                  <p className="animate-in slide-in-from-left-2 fade-in ml-2 text-xs font-medium text-red-500">
                    {errors[field.name]}
                  </p>
                )}
              </div>
            ))}

            <button
              type="submit"
              disabled={isSubmitted}
              className={clsx(
                'group relative mt-4 w-full overflow-hidden rounded-xl px-6 py-3 font-bold transition-all duration-300',
                isSubmitted
                  ? 'cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-white/5'
                  : 'bg-linear-to-r from-gray-900 via-gray-800 to-gray-900 text-white shadow-xl shadow-gray-900/10 hover:shadow-2xl hover:shadow-gray-900/20 active:scale-[0.98] dark:from-white dark:via-gray-200 dark:to-white dark:text-black dark:shadow-white/5 dark:hover:shadow-white/10',
              )}
            >
              {isSubmitted ? (
                <span className="flex items-center justify-center gap-2">
                  <Check size={20} />
                  {t('common.commited')}
                </span>
              ) : (
                <>
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    {t('common.commit')}
                  </span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default InteractiveForm
