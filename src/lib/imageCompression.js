/**
 * Image Compression Utility
 * Compresses images to reduce file size and token costs for AI vision APIs
 */

// Configuration constants
const DEFAULT_MAX_WIDTH = 1024 // Max width in pixels
const DEFAULT_MAX_HEIGHT = 1024 // Max height in pixels
const DEFAULT_QUALITY = 0.8 // JPEG compression quality (0-1)
const MAX_FILE_SIZE_MB = 10 // Maximum file size before compression (MB)
const MAX_COMPRESSED_SIZE_MB = 2 // Maximum allowed size after compression (MB)

/**
 * Calculate Base64 string size in bytes
 * @param {string} base64String - Base64 encoded string
 * @returns {number} Size in bytes
 */
export const getBase64Size = base64String => {
  // Remove data URL prefix if present
  const base64 = base64String.split(',')[1] || base64String
  // Base64 encoding increases size by ~33%, so decode to get actual size
  const padding = (base64.match(/=/g) || []).length
  return (base64.length * 3) / 4 - padding
}

/**
 * Format bytes to human-readable string
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted string (e.g., "2.5 MB")
 */
export const formatFileSize = bytes => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}

/**
 * Compress an image file to reduce size
 * @param {File} file - Image file to compress
 * @param {Object} options - Compression options
 * @param {number} options.maxWidth - Maximum width (default: 1024)
 * @param {number} options.maxHeight - Maximum height (default: 1024)
 * @param {number} options.quality - JPEG quality 0-1 (default: 0.8)
 * @returns {Promise<{dataUrl: string, originalSize: number, compressedSize: number}>}
 */
export const compressImage = (
  file,
  { maxWidth = DEFAULT_MAX_WIDTH, maxHeight = DEFAULT_MAX_HEIGHT, quality = DEFAULT_QUALITY } = {},
) => {
  return new Promise((resolve, reject) => {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      reject(new Error('File is not an image'))
      return
    }

    // Check file size before compression
    const fileSizeMB = file.size / (1024 * 1024)
    if (fileSizeMB > MAX_FILE_SIZE_MB) {
      reject(
        new Error(
          `Image size (${formatFileSize(file.size)}) exceeds maximum allowed size (${MAX_FILE_SIZE_MB} MB)`,
        ),
      )
      return
    }

    const reader = new FileReader()

    reader.onerror = () => reject(new Error('Failed to read image file'))

    reader.onload = e => {
      const img = new Image()

      img.onerror = () => reject(new Error('Failed to load image'))

      img.onload = () => {
        try {
          // Calculate new dimensions while maintaining aspect ratio
          let { width, height } = img

          if (width > maxWidth || height > maxHeight) {
            const aspectRatio = width / height

            if (width > height) {
              width = Math.min(width, maxWidth)
              height = width / aspectRatio
            } else {
              height = Math.min(height, maxHeight)
              width = height * aspectRatio
            }
          }

          // Create canvas and draw resized image
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height

          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0, width, height)

          // Determine output format
          // Preserve PNG for images with potential transparency
          // Otherwise convert to JPEG for better compression
          const isPNG = file.type === 'image/png'
          const outputFormat = isPNG ? 'image/png' : 'image/jpeg'
          const outputQuality = isPNG ? 0.95 : quality // PNG quality is less critical

          // Convert to appropriate format with compression
          const compressedDataUrl = canvas.toDataURL(outputFormat, outputQuality)

          // Check compressed size
          const compressedSize = getBase64Size(compressedDataUrl)
          const compressedSizeMB = compressedSize / (1024 * 1024)

          if (compressedSizeMB > MAX_COMPRESSED_SIZE_MB) {
            reject(
              new Error(
                `Compressed image (${formatFileSize(compressedSize)}) still exceeds maximum size (${MAX_COMPRESSED_SIZE_MB} MB). Try a smaller image.`,
              ),
            )
            return
          }

          resolve({
            dataUrl: compressedDataUrl,
            originalSize: file.size,
            compressedSize,
            dimensions: { width: Math.round(width), height: Math.round(height) },
          })
        } catch (error) {
          reject(new Error(`Image compression failed: ${error.message}`))
        }
      }

      img.src = e.target.result
    }

    reader.readAsDataURL(file)
  })
}

/**
 * Compress multiple images in parallel
 * @param {File[]} files - Array of image files
 * @param {Object} options - Compression options (same as compressImage)
 * @returns {Promise<Array<{dataUrl: string, originalSize: number, compressedSize: number, error?: string}>>}
 */
export const compressImages = async (files, options = {}) => {
  const promises = files.map(file =>
    compressImage(file, options)
      .then(result => ({ ...result, success: true }))
      .catch(error => ({ success: false, error: error.message, fileName: file.name })),
  )

  return Promise.all(promises)
}
