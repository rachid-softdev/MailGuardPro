// Types pour le moteur de validation email

export interface CheckResult {
  passed: boolean
  weight: number
  message: string
  detail?: string
}

export interface ValidationChecks {
  format: CheckResult
  mx: CheckResult
  smtp: CheckResult
  catchAll: CheckResult
  disposable: CheckResult
  generic: CheckResult
  freeProvider: CheckResult
  dnsbl: CheckResult
  spf: CheckResult
  dmarc: CheckResult
  typo: CheckResult
}

export interface DomainInfo {
  name: string
  registrar?: string
  createdAt?: string
  ageInDays?: number
  reputation: 'good' | 'neutral' | 'poor'
}

export interface ValidationResult {
  email: string
  score: number
  status: 'valid' | 'invalid' | 'risky' | 'unknown'
  checks: ValidationChecks
  domain: DomainInfo
  suggestion?: string
  processingTimeMs: number
}

export interface BulkJobProgress {
  processed: number
  total: number
  percentage: number
}

export type EmailStatus = 'valid' | 'invalid' | 'risky' | 'unknown'

export type ExportFormat = 'csv' | 'json' | 'xlsx' | 'pdf'

export interface ExportOptions {
  jobId: string
  format: ExportFormat
  filters?: {
    status?: EmailStatus[]
    minScore?: number
    maxScore?: number
  }
}