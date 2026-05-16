// Score de réputation de domaine - Optimisé pour la performance

import { DomainInfo } from './types'

// Timeouts pour éviter de bloquer sur une API lente
const RDAP_TIMEOUT_MS = 2000
const WHOIS_TIMEOUT_MS = 2000

// Helper pour fetch avec timeout
async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  options: RequestInit = {}
): Promise<Response | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    return response
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

// Parser la réponse RDAP pour extraire la date de création
function parseRdapResponse(data: any): { createdAt?: string; ageInDays?: number } | null {
  const creationEvent = data.events?.find(
    (e: any) => e.eventAction === 'registration' || e.eventAction === 'creation'
  )

  if (creationEvent?.eventDate) {
    const created = new Date(creationEvent.eventDate)
    const ageInDays = Math.floor((Date.now() - created.getTime()) / (1000 * 60 * 60 * 24))

    return {
      createdAt: creationEvent.eventDate,
      ageInDays,
    }
  }

  return null
}

// Parser la réponse WHOIS pour extraire la date de création
function parseWhoisResponse(data: any): { createdAt?: string; ageInDays?: number } | null {
  const createdDate = data.created_date || data.creation_date
  if (createdDate) {
    const created = new Date(createdDate)
    const ageInDays = Math.floor((Date.now() - created.getTime()) / (1000 * 60 * 60 * 24))

    return {
      createdAt: createdDate,
      ageInDays,
    }
  }

  return null
}

// Fetch RDAP avec timeout
async function fetchRDAP(domain: string): Promise<{ createdAt?: string; ageInDays?: number } | null> {
  const response = await fetchWithTimeout(
    `https://rdap.org/domain/${domain}`,
    RDAP_TIMEOUT_MS,
    { next: { revalidate: 86400 } }
  )

  if (!response?.ok) return null

  try {
    const data = await response.json()
    return parseRdapResponse(data)
  } catch {
    return null
  }
}

// Fetch WHOIS avec timeout
async function fetchWHOIS(domain: string): Promise<{ createdAt?: string; ageInDays?: number } | null> {
  const response = await fetchWithTimeout(
    `https://whois.freeai.dev/v1/whois?domain=${domain}`,
    WHOIS_TIMEOUT_MS,
    { next: { revalidate: 86400 } }
  )

  if (!response?.ok) return null

  try {
    const data = await response.json()
    return parseWhoisResponse(data)
  } catch {
    return null
  }
}

// Récupérer l'âge du domaine - Version PARALLÈLE (plus rapide!)
// Lancement des deux API en même temps, on prend le premier résultat
export async function getDomainAge(domain: string): Promise<{ createdAt?: string; ageInDays?: number }> {
  // Lancer les deux requêtes en parallèle
  const [rdapResult, whoisResult] = await Promise.all([
    fetchRDAP(domain).catch(() => null),
    fetchWHOIS(domain).catch(() => null),
  ])

  // Prendre le premier résultat valide
  if (rdapResult) return rdapResult
  if (whoisResult) return whoisResult

  return {}
}

// Calculer la réputation du domaine basée sur plusieurs facteurs
export async function getDomainReputation(domain: string): Promise<DomainInfo> {
  const ageInfo = await getDomainAge(domain)

  // Calculer le score de réputation (0-100)
  let reputationScore = 50 // baseline

  // Facteur 1: Âge du domaine
  if (ageInfo.ageInDays) {
    if (ageInfo.ageInDays > 365 * 5) {
      reputationScore += 25 // Domaine très ancien (5+ ans)
    } else if (ageInfo.ageInDays > 365 * 2) {
      reputationScore += 15 // Domaine ancien (2+ ans)
    } else if (ageInfo.ageInDays > 365) {
      reputationScore += 5 // Domaine établi (1+ an)
    } else if (ageInfo.ageInDays < 30) {
      reputationScore -= 30 // Domaine très récent
    } else if (ageInfo.ageInDays < 90) {
      reputationScore -= 15 // Domaine récent
    } else if (ageInfo.ageInDays < 180) {
      reputationScore -= 5 // Domaine assez récent
    }
  }

  // Facteur 2: Vérifier si c'est un domaine connu (TLDs populaires)
  const knownTlds = ['.com', '.net', '.org', '.io', '.co']
  const isKnownTld = knownTlds.some(tld => domain.endsWith(tld))
  if (isKnownTld) {
    reputationScore += 5
  }

  // Facteur 3: Domaine avec plusieurs sous-domaines peut indiquer un service établi
  const subdomainCount = (domain.match(/\./g) || []).length
  if (subdomainCount > 1) {
    reputationScore += 5
  }

  // Déterminer la catégorie finale
  let reputation: 'good' | 'neutral' | 'poor'

  if (reputationScore >= 65) {
    reputation = 'good'
  } else if (reputationScore >= 40) {
    reputation = 'neutral'
  } else {
    reputation = 'poor'
  }

  return {
    name: domain,
    createdAt: ageInfo.createdAt,
    ageInDays: ageInfo.ageInDays,
    reputation,
  }
}