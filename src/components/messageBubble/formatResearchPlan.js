/**
 * Format research plan from JSON or string to markdown
 * Handles various research plan formats with multiple fields
 */

/**
 * Format research plan content to markdown
 * @param {string} planContent - Raw plan content (JSON string or plain text)
 * @param {function} t - Translation function
 * @returns {string} Formatted markdown
 */
export function formatResearchPlanMarkdown(planContent, t) {
  if (!planContent) return ''
  const trimmed = planContent.trim()
  if (!trimmed) return ''

  try {
    const parsed = JSON.parse(trimmed)
    const goal = parsed.goal ? `**${t('messageBubble.researchGoal')}:** ${parsed.goal}` : ''

    // New fields: complexity and question_type
    const complexity = parsed.complexity
      ? `**${t('messageBubble.researchComplexity')}:** ${parsed.complexity}`
      : ''
    const questionType = parsed.question_type
      ? `**${t('messageBubble.researchQuestionType')}:** ${parsed.question_type}`
      : ''

    const assumptions = Array.isArray(parsed.assumptions)
      ? parsed.assumptions
          .filter(Boolean)
          .map(item => `- ${item}`)
          .join('\n')
      : ''

    const steps = Array.isArray(parsed.plan)
      ? parsed.plan
          .map(step => {
            if (!step) return ''
            const title = step.step ? `**${step.step}.**` : '**-**'
            const action = step.action ? ` ${step.action}` : ''
            const expected = step.expected_output
              ? `\n  - ${t('messageBubble.researchExpected')}: ${step.expected_output}`
              : ''
            const thought = step.thought
              ? `\n  - ${t('messageBubble.researchThought')}: ${step.thought}`
              : ''

            // New fields: deliverable_format, acceptance_criteria, depth
            const format = step.deliverable_format
              ? `\n  - ${t('messageBubble.researchDeliverableFormat')}: ${step.deliverable_format}`
              : ''

            const criteria = Array.isArray(step.acceptance_criteria)
              ? step.acceptance_criteria
                  .filter(Boolean)
                  .map(item => `\n  - ${t('messageBubble.researchAcceptanceCriteria')}: ${item}`)
                  .join('')
              : ''

            const depth = step.depth
              ? `\n  - ${t('messageBubble.researchDepth')}: ${step.depth}`
              : ''

            const requiresSearch =
              step.requires_search !== undefined
                ? `\n  - ${t('messageBubble.researchRequiresSearch')}: ${step.requires_search ? '✅' : '❌'}`
                : ''

            return `${title}${action}${thought}${expected}${format}${depth}${requiresSearch}${criteria}`.trim()
          })
          .filter(Boolean)
          .join('\n\n')
      : ''

    const risks = Array.isArray(parsed.risks)
      ? parsed.risks
          .filter(Boolean)
          .map(item => `- ${item}`)
          .join('\n')
      : ''

    const success = Array.isArray(parsed.success_criteria)
      ? parsed.success_criteria
          .filter(Boolean)
          .map(item => `- ${item}`)
          .join('\n')
      : ''

    const sections = []
    sections.push(`### ${t('messageBubble.researchPlan')}`)

    // New field: research_type
    if (parsed.research_type) {
      const typeLabel =
        parsed.research_type === 'academic'
          ? t('messageBubble.researchTypeAcademic')
          : t('messageBubble.researchTypeGeneral')
      sections.push(`**${t('messageBubble.researchType')}:** ${typeLabel}`)
    }

    if (goal) sections.push(goal)
    // Add new fields after goal
    if (complexity) sections.push(complexity)
    if (questionType) sections.push(questionType)
    if (assumptions) {
      sections.push(`**${t('messageBubble.researchAssumptions')}:**`)
      sections.push(assumptions)
    }
    if (steps) {
      sections.push(`**${t('messageBubble.researchSteps')}:**`)
      sections.push(steps)
    }
    if (risks) {
      sections.push(`**${t('messageBubble.researchRisks')}:**`)
      sections.push(risks)
    }
    if (success) {
      sections.push(`**${t('messageBubble.researchSuccessCriteria')}:**`)
      sections.push(success)
    }

    return sections.filter(Boolean).join('\n\n')
  } catch {
    // If parsing fails, return as plain text with heading
    return `${t('messageBubble.researchPlan')}\n\n${trimmed}`
  }
}
