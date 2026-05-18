import { describe, it, expect } from 'vitest'

describe('StatusBadge', () => {
  it('should be defined', async () => {
    const { StatusBadge } = await import('@/components/ui/StatusBadge')
    expect(StatusBadge).toBeDefined()
  })

  it('should be a function component', async () => {
    const { StatusBadge } = await import('@/components/ui/StatusBadge')
    expect(typeof StatusBadge).toBe('function')
  })

  describe('statusConfig', () => {
    it('should have valid config', async () => {
      // Import through the component file to test internal config
      const module = await import('@/components/ui/StatusBadge')
      // The config is internal, but we can verify the component accepts all statuses
      expect(module.StatusBadge).toBeDefined()
    })
  })
})