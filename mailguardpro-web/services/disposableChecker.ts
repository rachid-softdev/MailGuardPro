// Détection des emails jetables (disposable email domains)

import { redis } from '@/lib/redis'
import { CheckResult } from './types'

// Liste de domaines jetables connus (subset populaire)
const KNOWN_DISPOSABLE_DOMAINS = new Set([
  'guerrillamail.com',
  'guerrillamail.net',
  'guerrillamail.org',
  'guerrillamailblock.com',
  'spam4.me',
  'mailinator.com',
  'mailinator.net',
  'mailinator.org',
  'tempmail.com',
  'tempmail.net',
  'yopmail.com',
  'yopmail.fr',
  'yopmail.net',
  '10minutemail.com',
  '10minutemail.net',
  'throwaway.email',
  'getnada.com',
  'mintemail.com',
  'sharklasers.com',
  'spam.la',
  'trashmail.com',
  'trashmail.net',
  'maildrop.cc',
  'mytrashmail.com',
  'fakeinbox.com',
  'mailnesia.com',
  'tempr.email',
  'dispostable.com',
  'emailondeck.com',
  'mohmal.com',
  'temp-mail.io',
  'mail-temporaire.fr',
  'yandex.com', // Alias jetables possibles
  'icloud.com', // Relays
])

// URL de la liste blocklist publique (optionnelle, peut être utilisée pour sync hebdo)
const DISPOSABLE_LIST_URL = 'https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/master/disposable_domains.txt'

interface DisposableResult extends CheckResult {
  provider?: string
}

export async function checkDisposable(email: string): Promise<DisposableResult> {
  const domain = email.split('@')[1]?.toLowerCase()
  
  if (!domain) {
    return {
      passed: true,
      weight: 10,
      message: 'Domaine invalide',
    }
  }
  
  // 1. Vérifier le cache Redis
  try {
    const cached = await redis.get(`disposable:${domain}`)
    if (cached !== null) {
      const isDisposable = cached === '1'
      return {
        passed: !isDisposable,
        weight: 10,
        message: isDisposable ? 'Email jetable' : 'Email non-jetable',
        detail: isDisposable ? `Domaine ${domain} connu comme jetable` : undefined,
        provider: cached === '1' ? 'cache' : undefined,
      }
    }
  } catch {
    // Redis non disponible, continuer avec la liste intégrée
  }
  
  // 2. Vérifier la liste intégrée
  if (KNOWN_DISPOSABLE_DOMAINS.has(domain)) {
    // Mettre en cache pour 24h
    try {
      await redis.setex(`disposable:${domain}`, 86400, '1')
    } catch {
      // Redis non disponible
    }
    
    return {
      passed: false,
      weight: 10,
      message: 'Email jetable',
      detail: `${domain} est un domaine d'email temporaire connu`,
      provider: 'builtin-list',
    }
  }
  
  // 3. Optionnel: vérifier la liste blocklist externe
  // (désactivé par défaut pour éviter latence, à activer si besoin)
  try {
    const response = await fetch(DISPOSABLE_LIST_URL, { 
      next: { revalidate: 86400 } // Cache 24h
    })
    if (response.ok) {
      const text = await response.text()
      const domains = new Set(text.split('\n').map(d => d.trim().toLowerCase()).filter(Boolean))
      
      if (domains.has(domain)) {
        await redis.setex(`disposable:${domain}`, 86400, '1')
        return {
          passed: false,
          weight: 10,
          message: 'Email jetable',
          detail: `Domaine trouvé dans la liste des emails jetables`,
          provider: 'blocklist',
        }
      }
    }
  } catch (error) {
    // Ne pas bloquer si la liste externe échoue
    console.warn('Failed to fetch disposable domains list:', error)
  }
  
  // Non trouvé → non jetable
  try {
    await redis.setex(`disposable:${domain}`, 86400, '0')
  } catch {
    // Redis non disponible
  }
  
  return {
    passed: true,
    weight: 10,
    message: 'Email non-jetable',
    detail: undefined,
  }
}

// Fonction pour synchroniser la liste blocklist (appelée par cron)
export async function syncDisposableDomains(): Promise<{ added: number }> {
  try {
    const response = await fetch(DISPOSABLE_LIST_URL)
    if (!response.ok) {
      throw new Error('Failed to fetch list')
    }
    
    const text = await response.text()
    const domains = text.split('\n').map(d => d.trim().toLowerCase()).filter(Boolean)
    
    // Ajouter à la liste intégrée
    for (const domain of domains) {
      KNOWN_DISPOSABLE_DOMAINS.add(domain)
    }
    
    return { added: domains.length }
  } catch (error) {
    console.error('Failed to sync disposable domains:', error)
    return { added: 0 }
  }
}