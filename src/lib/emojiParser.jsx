import React from 'react'
import EmojiDisplay from '../components/EmojiDisplay'

/**
 * Checks if a string is likely an emoji using regex.
 * We use \p{Extended_Pictographic} to detect if the grapheme contains emoji-like characters.
 */
const IS_EMOJI_REGEX = /\p{Extended_Pictographic}/u

/**
 * Parses text content and replaces emojis with EmojiDisplay components.
 * Uses Intl.Segmenter to correctly handle multi-codepoint emojis (like 👨‍👩‍👧‍👦 or 🏳️‍🌈).
 */
export const parseEmojis = content => {
  if (typeof content !== 'string') return content
  if (!content) return content

  // Fast path: if no emoji-like characters, return original string
  if (!IS_EMOJI_REGEX.test(content)) return content

  const segments = []
  let lastIndex = 0

  // Use Intl.Segmenter to split by grapheme clusters (correctly handles emoji sequences)
  const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' })
  const iterator = segmenter.segment(content)

  const nodes = []
  let currentText = ''

  for (const { segment, index, isWordLike } of iterator) {
    // Check if this segment is an emoji
    // We test specifically for emoji characters.
    // Note: Numbers like '1' are not Extended_Pictographic, but '1️⃣' might be.
    // We rely on the regex to catch likely candidates.
    if (IS_EMOJI_REGEX.test(segment)) {
      // Flush previous text
      if (currentText) {
        nodes.push(currentText)
        currentText = ''
      }

      // Push Emoji component
      // We assume the segment is a single emoji grapheme
      nodes.push(
        <EmojiDisplay
          key={`emoji-${index}`}
          emoji={segment}
          className="align-text-bottom" // Align better with text
          size="1.2em" // Slightly larger than text usually looks better
        />,
      )
    } else {
      currentText += segment
    }
  }

  // Flush remaining text
  if (currentText) {
    nodes.push(currentText)
  }

  return nodes
}

/**
 * Recursively parses children to replace emojis in text nodes.
 */
export const parseChildrenWithEmojis = children => {
  return React.Children.map(children, child => {
    if (typeof child === 'string') {
      return parseEmojis(child)
    }
    if (React.isValidElement(child) && child.props.children) {
      // Don't recurse into code blocks or certain elements if needed
      // For now, we recurse into everything except if it looks like a code block
      // But here we usually just use this on specific markdown elements (p, h1, etc)
      return React.cloneElement(child, {
        children: parseChildrenWithEmojis(child.props.children),
      })
    }
    return child
  })
}
