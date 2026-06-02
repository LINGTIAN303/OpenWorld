import type { ISettingsStore } from '../../toolbus/types'
import type { ProviderConfig } from '../../providers/config'

export class CliSettingsStore implements ISettingsStore {
  private config: ProviderConfig

  constructor(config: ProviderConfig) {
    this.config = config
  }

  getProviderConfig(): ProviderConfig {
    return this.config
  }

  getSearchConfig(): { engine?: string; apiKey?: string } {
    return {}
  }
}
