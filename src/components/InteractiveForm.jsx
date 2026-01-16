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
          'w-full pl-4 pr-10 py-3.5 rounded-2xl cursor-pointer transition-all duration-300 border border-gray-200 dark:border-white/10',
          'flex items-center justify-between',
          'bg-gray-50/50 dark:bg-zinc-900/50 hover:bg-white dark:hover:bg-zinc-800 backdrop-blur-md',
          isOpen
            ? 'ring-2 ring-primary-500/20 border-primary-500/50 shadow-lg shadow-primary-500/5'
            : ' hover:border-gray-200 dark:hover:border-white/10',
          disabled && 'opacity-60 cursor-not-allowed',
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
            'absolute right-3.5 transition-transform duration-300 text-gray-400',
            isOpen && 'rotate-180',
          )}
        >
          <ChevronDown size={18} strokeWidth={2.5} />
        </div>
      </div>

      {/* Dropdown Menu */}
      <div
        className={clsx(
          'absolute z-[60] w-full mt-2 py-1.5 rounded-2xl border border-gray-100 dark:border-white/10 shadow-2xl overflow-hidden',
          'bg-white dark:bg-zinc-900  origin-top transition-all duration-200',
          isOpen
            ? 'opacity-100 scale-100 translate-y-0'
            : 'opacity-0 scale-95 -translate-y-2 pointer-events-none',
        )}
      >
        <div className="max-h-[300px] overflow-y-auto px-1.5 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-white/10">
          {options.map(opt => (
            <div
              key={opt}
              onClick={() => handleSelect(opt)}
              className={clsx(
                'px-3.5 py-2.5 my-0.5 rounded-xl cursor-pointer text-sm font-medium transition-all duration-200 flex items-center justify-between group',
                value === opt
                  ? 'bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-gray-200',
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
  // Initialize values
  const formDataString = JSON.stringify(formData)
  const submittedValuesString = JSON.stringify(submittedValues)

  React.useEffect(() => {
    const initialValues = {}
    formData.fields?.forEach(field => {
      const submittedValue = submittedValues[field.label] || submittedValues[field.name]
      if (submittedValue !== undefined) {
        if (field.type === 'checkbox') {
          initialValues[field.name] = submittedValue.split(',').map(v => v.trim())
        } else if (field.type === 'number' || field.type === 'range') {
          initialValues[field.name] = Number(submittedValue)
        } else {
          initialValues[field.name] = submittedValue
        }
      } else {
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
  }, [formDataString, submittedValuesString])

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
    setValues(prev => {
      const current = prev[name] || []
      const newValue = current.includes(option)
        ? current.filter(v => v !== option)
        : [...current, option]
      return { ...prev, [name]: newValue }
    })
  }

  return (
    <div className="mb-4 w-full max-w-2xl mx-auto relative z-30">
      <div className="p-6 md:p-8 rounded-4xl mb-4 bg-white/80 dark:bg-black/40 backdrop-blur-xl border border-gray-200 dark:border-white/10 shadow-xl shadow-gray-200/50 dark:shadow-black/50 relative group transition-all duration-300">
        {/* Decorative Background Gradients */}
        <div className="absolute -top-20 -right-20 w-60 h-60 bg-primary-500/10 rounded-full blur-[80px] group-hover:bg-primary-500/15 transition-colors duration-700 pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-60 h-60 bg-orange-500/10 rounded-full blur-[80px] group-hover:bg-orange-500/15 transition-colors duration-700 pointer-events-none" />
        {developerMode && (
          <button
            type="button"
            onClick={onShowDetails}
            className="absolute top-6 right-6 z-20 text-[10px] text-primary-600 dark:text-primary-300 hover:underline font-medium"
          >
            {t('messageBubble.toolDetails')}
          </button>
        )}

        <div className="relative z-10">
          {/* Header */}
          <div className="mb-8">
            {formData.title && (
              <h4 className="text-xl md:text-2xl font-bold bg-gradient-to-br from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 bg-clip-text text-transparent mb-3">
                {formData.title}
              </h4>
            )}
            {formData.description && (
              <p className="text-sm md:text-base text-gray-500 dark:text-gray-400 leading-relaxed font-medium">
                {formData.description}
              </p>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {formData.fields?.map((field, idx) => (
              <div
                key={field.name}
                className="space-y-2.5 animate-in slide-in-from-bottom-2 fade-in duration-500"
                style={{ animationDelay: `${idx * 50}ms` }}
              >
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 ml-1">
                  {field.label}
                  {field.required && <span className="text-primary-500 ml-0.5">*</span>}
                </label>

                {/* Custom Select */}
                {field.type === 'select' && (
                  <CustomSelect
                    value={values[field.name]}
                    onChange={val => updateValue(field.name, val)}
                    options={field.options}
                    placeholder="请选择..."
                    disabled={isSubmitted}
                    error={errors[field.name]}
                  />
                )}

                {/* Checkbox Group */}
                {field.type === 'checkbox' && (
                  <div className="flex flex-wrap gap-2.5">
                    {field.options?.map(opt => {
                      const isChecked = (values[field.name] || []).includes(opt)
                      return (
                        <label
                          key={opt}
                          className={clsx(
                            'relative px-4 py-2.5 rounded-xl cursor-pointer transition-all duration-300 select-none overflow-hidden group/item border',
                            isChecked
                              ? 'bg-primary-500 border-primary-500 text-white shadow-lg shadow-primary-500/25 scale-[1.02]'
                              : 'bg-gray-50 dark:bg-zinc-900/40 border-transparent hover:border-gray-200 dark:hover:border-white/10 text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-zinc-800',
                            isSubmitted && 'opacity-60 cursor-not-allowed pointer-events-none',
                          )}
                        >
                          <input
                            type="checkbox"
                            className="hidden"
                            checked={isChecked}
                            onChange={() => !isSubmitted && toggleCheckbox(field.name, opt)}
                            disabled={isSubmitted}
                          />
                          <span className="text-sm font-medium relative z-10 flex items-center gap-2">
                            {isChecked && <Check size={14} strokeWidth={3} />}
                            {opt}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                )}

                {/* Inputs */}
                {(field.type === 'text' || field.type === 'number') && (
                  <div className="relative group/input">
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
                        'w-full px-4 py-3.5 border border-gray-200 dark:border-white/10  rounded-2xl outline-none transition-all duration-300 font-medium',
                        'bg-gray-50/50 dark:bg-zinc-900/40 border backdrop-blur-sm',
                        isSubmitted
                          ? 'opacity-60 cursor-not-allowed '
                          : ' hover:border-gray-200 dark:hover:border-white/10 hover:bg-white dark:hover:bg-zinc-800 focus:bg-white dark:focus:bg-black focus:border-primary-500/50 focus:ring-4 focus:ring-primary-500/10 focus:shadow-lg focus:shadow-primary-500/5',
                        errors[field.name] && 'border-red-500/50! bg-red-50/10! shadow-none!',
                      )}
                    />
                  </div>
                )}

                {/* Range Slider */}
                {field.type === 'range' && (
                  <div className="px-1 py-4 bg-gray-50/50 dark:bg-zinc-900/40 rounded-2xl border  border-gray-200 dark:border-white/10 hover:border-gray-200 dark:hover:border-white/10 transition-colors">
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
                          'w-full h-2 rounded-lg appearance-none cursor-pointer bg-gray-200 dark:bg-zinc-700 accent-primary-500',
                          isSubmitted && 'opacity-60 cursor-not-allowed',
                        )}
                      />
                    </div>
                    <div className="flex justify-between items-center px-4 mt-3 text-xs font-medium text-gray-400 font-mono">
                      <span>{field.min || 0}</span>
                      <span className="text-primary-600 dark:text-primary-400 bg-white dark:bg-white/10 px-2.5 py-1 rounded-md shadow-sm">
                        {values[field.name] || field.min || 0}
                        {field.unit && (
                          <span className="text-[10px] ml-0.5 opacity-70">{field.unit}</span>
                        )}
                      </span>
                      <span>{field.max || 100}</span>
                    </div>
                  </div>
                )}

                {errors[field.name] && (
                  <p className="text-xs text-red-500 ml-2 font-medium animate-in slide-in-from-left-2 fade-in">
                    {errors[field.name]}
                  </p>
                )}
              </div>
            ))}

            <button
              type="submit"
              disabled={isSubmitted}
              className={clsx(
                'w-full px-6 py-4 mt-4 font-bold rounded-2xl transition-all duration-300 relative overflow-hidden group',
                isSubmitted
                  ? 'bg-gray-100 dark:bg-white/5 text-gray-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 dark:from-white dark:via-gray-200 dark:to-white text-white dark:text-black shadow-xl shadow-gray-900/10 dark:shadow-white/5 hover:shadow-2xl hover:shadow-gray-900/20 dark:hover:shadow-white/10 active:scale-[0.98]',
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
