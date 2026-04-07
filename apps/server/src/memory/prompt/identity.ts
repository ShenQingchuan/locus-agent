import { getSetting, setSetting } from '../../settings/index.js'

const IDENTITY_SETTING_KEY = 'memory.identity'

export function getMemoryIdentity(): string {
  const value = getSetting(IDENTITY_SETTING_KEY)
  return typeof value === 'string' ? value : ''
}

export function setMemoryIdentity(value: string): void {
  setSetting(IDENTITY_SETTING_KEY, value)
}
