// Lead Finder - Générer et valider des emails предполагаемые

import { validateEmail } from './emailValidator'
import { ValidationResult } from './types'

export interface LeadFinderInput {
  firstName: string
  lastName: string
  companyDomain: string
  knownEmail?: string // Pour déduire le pattern
}

export interface LeadFinderResult {
  email: string
  confidence: number // 0-1
  pattern: string
  isValid: boolean
  validation?: ValidationResult
}

// Patterns d'email à tester
const EMAIL_PATTERNS = [
  // Format standard
  '{first}.{last}@{domain}',
  '{first}{last}@{domain}',
  '{first}_{last}@{domain}',
  
  // Initiales
  '{f}.{last}@{domain}',
  '{first}{l}@{domain}',
  '{f}{last}@{domain}',
  '{first}.{l}@{domain}',
  
  // Prénom seul
  '{first}@{domain}',
  '{first}{domainWithoutTld}@{tld}',
  
  // Nom seul
  '{last}@{domain}',
  
  // Avec numéro
  '{first}{last}1@{domain}',
  '{first}.{last}2024@{domain}',
  
  // Versions commerciales
  'contact@{domain}',
  'info@{domain}',
]

// Déduire le pattern utilisé par un email connu
function inferPattern(knownEmail: string): string[] {
  const [localPart] = knownEmail.split('@')
  const parts = localPart.split(/[._-]/)
  
  //heuristique simple pour déduire le pattern
  if (parts.length === 2) {
    // first.last ou first_last ou first-last ou flast
    const [first, last] = parts
    if (first.length === 1) {
      return ['{f}.{last}@{domain}', '{f}{last}@{domain}']
    }
    if (last.length === 1) {
      return ['{first}{l}@{domain}']
    }
    return ['{first}.{last}@{domain}', '{first}_{last}@{domain}', '{first}{last}@{domain}']
  }
  
  if (parts.length === 1) {
    // first ou last seul
    if (parts[0].length <= 4) {
      return ['{last}@{domain}']
    }
    return ['{first}@{domain}']
  }
  
  // Retourner les patterns par défaut
  return EMAIL_PATTERNS
}

// Transformer le pattern en email
function applyPattern(
  pattern: string,
  firstName: string,
  lastName: string,
  domain: string
): string {
  const first = firstName.toLowerCase().trim()
  const last = lastName.toLowerCase().trim()
  const f = first.charAt(0).toLowerCase()
  const l = last.charAt(0).toLowerCase()
  
  // Split domain
  const [domainName, ...tldParts] = domain.split('.')
  const tld = tldParts.join('.')
  
  return pattern
    .replace(/{first}/g, first)
    .replace(/{last}/g, last)
    .replace(/{f}/g, f)
    .replace(/{l}/g, l)
    .replace(/{domain}/g, domain)
    .replace(/{domainWithoutTld}/g, domainName)
    .replace(/{tld}/g, tld)
}

// Main function - trouver le meilleur email probable
export async function findLeadEmail(
  input: LeadFinderInput,
  validate = true
): Promise<LeadFinderResult | null> {
  const { firstName, lastName, companyDomain, knownEmail } = input
  
  if (!firstName || !lastName || !companyDomain) {
    return null
  }
  
  // Déterminer les patterns à tester
  const patterns = knownEmail ? inferPattern(knownEmail) : EMAIL_PATTERNS
  
  // Tester chaque pattern
  for (const pattern of patterns) {
    const email = applyPattern(pattern, firstName, lastName, companyDomain)
    
    // Ne pas tester les emails génériques comme pattern
    if (email.startsWith('contact@') || email.startsWith('info@')) {
      continue // Skip pour l'instant, peut-être ajouté plus tard
    }
    
    // Valider si demandé
    if (validate) {
      try {
        const validation = await validateEmail(email)
        
        // Considérer comme trouvé si valid ou risky
        if (validation.status === 'valid' || validation.status === 'risky') {
          const confidence = validation.status === 'valid'
            ? validation.score / 100
            : validation.score / 100 * 0.7 // Réduire confiance pour risky
          
          return {
            email,
            confidence,
            pattern,
            isValid: true,
            validation,
          }
        }
      } catch (error) {
        // Continue au prochain pattern
        console.warn(`Failed to validate ${email}:`, error)
      }
    } else {
      // Sans validation, retourner le premier pattern
      return {
        email,
        confidence: 0.3, // Confiance faible sans validation
        pattern,
        isValid: false,
      }
    }
  }
  
  // Aucun pattern n'a fonctionné
  return null
}

// Batch lead finder - traiter plusieurs leads
export async function findLeadEmails(
  inputs: LeadFinderInput[],
  onProgress?: (processed: number, total: number) => void
): Promise<LeadFinderResult[]> {
  const results: LeadFinderResult[] = []
  
  for (let i = 0; i < inputs.length; i++) {
    const result = await findLeadEmail(inputs[i])
    if (result) {
      results.push(result)
    }
    
    if (onProgress) {
      onProgress(i + 1, inputs.length)
    }
    
    // Rate limiting simple
    if (i < inputs.length - 1) {
      await new Promise(r => setTimeout(r, 100))
    }
  }
  
  return results
}