export const getPublicEnv = key => {
  if (typeof import.meta !== 'undefined' && import.meta.env && key in import.meta.env) {
    return import.meta.env[key]
  }
  return undefined
}

export const getNodeEnv = () => {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.MODE) {
    return import.meta.env.MODE
  }
  return 'development'
}
