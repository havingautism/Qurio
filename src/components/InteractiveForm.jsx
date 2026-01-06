import clsx from 'clsx'
import { Check } from 'lucide-react'
import React, { useState } from 'react'

/**
 * InteractiveForm Component
 * Renders dynamic forms based on AI-generated JSON definitions
 *
 * @param {Object} formData - Form definition from AI
 * @param {Function} onSubmit - Callback when form is submitted
 * @param {string} messageId - ID of the message containing this form
 */
const InteractiveForm = ({
  formData,
  onSubmit,
  messageId,
  isSubmitted = false,
  submittedValues = {},
}) => {
  const [values, setValues] = useState({})
  const [errors, setErrors] = useState({})

  // Initialize values from submitted data or defaults
  React.useEffect(() => {
    const initialValues = {}
    formData.fields?.forEach(field => {
      // Check if we have submitted value for this field
      const submittedValue = submittedValues[field.label] || submittedValues[field.name]

      if (submittedValue !== undefined) {
        // Use submitted value
        if (field.type === 'checkbox') {
          // Parse comma-separated values back to array
          initialValues[field.name] = submittedValue.split(',').map(v => v.trim())
        } else if (field.type === 'number' || field.type === 'range') {
          initialValues[field.name] = Number(submittedValue)
        } else {
          initialValues[field.name] = submittedValue
        }
      } else {
        // Use default value
        if (field.type === 'checkbox') {
          initialValues[field.name] = []
        } else if (field.type === 'range' && field.default !== undefined) {
          initialValues[field.name] = field.default
        } else {
          initialValues[field.name] = ''
        }
      }
    })
    setValues(initialValues)
  }, [formData, submittedValues])

  // Validate form
  const validate = () => {
    const newErrors = {}
    formData.fields?.forEach(field => {
      if (field.required) {
        const value = values[field.name]
        if (!value || (Array.isArray(value) && value.length === 0)) {
          newErrors[field.name] = '此项为必填'
        }
      }
    })
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // Handle submit
  const handleSubmit = e => {
    e.preventDefault()
    if (validate() && !isSubmitted) {
      onSubmit({
        formId: formData.id,
        values,
        messageId,
      })
    }
  }

  // Update value
  const updateValue = (name, value) => {
    setValues(prev => ({ ...prev, [name]: value }))
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: undefined }))
    }
  }

  // Toggle checkbox
  const toggleCheckbox = (name, option) => {
    setValues(prev => {
      const current = prev[name] || []
      const newValue = current.includes(option)
        ? current.filter(v => v !== option)
        : [...current, option]
      return { ...prev, [name]: newValue }
    })
  }

  return (
    <div className="my-4 p-4 border border-gray-200 dark:border-zinc-700 rounded-xl bg-gray-50 dark:bg-zinc-900/50">
      {/* Title */}
      {formData.title && (
        <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">
          {formData.title}
        </h4>
      )}

      {/* Description */}
      {formData.description && (
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{formData.description}</p>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {formData.fields?.map(field => (
          <div key={field.name} className="space-y-1.5">
            {/* Label */}
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </label>

            {/* Field rendering */}
            {field.type === 'select' && (
              <select
                value={values[field.name] || ''}
                onChange={e => updateValue(field.name, e.target.value)}
                disabled={isSubmitted}
                className={clsx(
                  'w-full px-3 py-2 rounded-lg border bg-white dark:bg-zinc-800 transition-colors',
                  isSubmitted && 'opacity-60 cursor-not-allowed',
                  errors[field.name]
                    ? 'border-red-500 focus:border-red-500'
                    : 'border-gray-300 dark:border-zinc-600 focus:border-primary-500',
                )}
              >
                <option value="">请选择...</option>
                {field.options?.map(opt => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            )}

            {field.type === 'checkbox' && (
              <div className="space-y-2">
                {field.options?.map(opt => {
                  const isChecked = (values[field.name] || []).includes(opt)
                  return (
                    <label key={opt} className="flex items-center gap-2 cursor-pointer group">
                      <div
                        onClick={() => !isSubmitted && toggleCheckbox(field.name, opt)}
                        className={clsx(
                          'w-5 h-5 rounded border-2 flex items-center justify-center transition-all',
                          isSubmitted && 'opacity-60 cursor-not-allowed',
                          isChecked
                            ? 'bg-primary-500 border-primary-500'
                            : 'bg-white dark:bg-zinc-800 border-gray-300 dark:border-zinc-600 group-hover:border-primary-400',
                        )}
                      >
                        {isChecked && <Check size={14} className="text-white" />}
                      </div>
                      <span className="text-sm text-gray-700 dark:text-gray-300">{opt}</span>
                    </label>
                  )
                })}
              </div>
            )}

            {field.type === 'text' && (
              <input
                type="text"
                value={values[field.name] || ''}
                onChange={e => updateValue(field.name, e.target.value)}
                placeholder={field.placeholder}
                disabled={isSubmitted}
                className={clsx(
                  'w-full px-3 py-2 rounded-lg border bg-white dark:bg-zinc-800 transition-colors',
                  isSubmitted && 'opacity-60 cursor-not-allowed',
                  errors[field.name]
                    ? 'border-red-500 focus:border-red-500'
                    : 'border-gray-300 dark:border-zinc-600 focus:border-primary-500',
                )}
              />
            )}

            {field.type === 'number' && (
              <input
                type="number"
                value={values[field.name] || ''}
                onChange={e => updateValue(field.name, e.target.value)}
                min={field.min}
                max={field.max}
                step={field.step}
                placeholder={field.placeholder}
                disabled={isSubmitted}
                className={clsx(
                  'w-full px-3 py-2 rounded-lg border bg-white dark:bg-zinc-800 transition-colors',
                  isSubmitted && 'opacity-60 cursor-not-allowed',
                  errors[field.name]
                    ? 'border-red-500 focus:border-red-500'
                    : 'border-gray-300 dark:border-zinc-600 focus:border-primary-500',
                )}
              />
            )}

            {field.type === 'range' && (
              <div className="space-y-2">
                <input
                  type="range"
                  value={values[field.name] || field.min || 0}
                  onChange={e => updateValue(field.name, Number(e.target.value))}
                  min={field.min || 0}
                  max={field.max || 100}
                  step={field.step || 1}
                  disabled={isSubmitted}
                  className={clsx('w-full', isSubmitted && 'opacity-60 cursor-not-allowed')}
                />
                <div className="text-sm text-gray-600 dark:text-gray-400 text-center">
                  {values[field.name] || field.min || 0}
                  {field.unit && ` ${field.unit}`}
                </div>
              </div>
            )}

            {/* Error message */}
            {errors[field.name] && (
              <p className="text-xs text-red-500 mt-1">{errors[field.name]}</p>
            )}
          </div>
        ))}

        {/* Submit button */}
        <button
          type="submit"
          disabled={isSubmitted}
          className={clsx(
            'w-full px-4 py-2.5 font-medium rounded-lg transition-colors',
            isSubmitted
              ? 'bg-gray-400 dark:bg-gray-600 text-gray-200 dark:text-gray-400 cursor-not-allowed'
              : 'bg-primary-500 hover:bg-primary-600 text-white',
          )}
        >
          {isSubmitted ? '✓ 已提交' : '提交并继续'}
        </button>
      </form>
    </div>
  )
}

export default InteractiveForm
