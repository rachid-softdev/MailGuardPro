// Score de réputation de domaine

import { DomainInfo } from './types'

// Récupérer l'âge du domaine via RDAP (plus fiable que Whois)
export async function getDomainAge(domain: string): Promise<{ createdAt?: string; ageInDays?: number }> {
  try {
    const response = await fetch(`https://rdap.org/domain/${domain}`, {
      next: { revalidate: 86400 }, // Cache 24h
    })
    
    if (!response.ok) {
      return {}
    }
    
    const data = await response.json()
    
    // Chercher la date de création dans les événements
    const creationEvent = data.events?.find((e: any) => 
      e.eventAction === 'registration' || e.eventAction === 'creation'
    )
    
    if (creationEvent?.eventDate) {
      const created = new Date(creationEvent.eventDate)
      const ageInDays = Math.floor((Date.now() - created.getTime()) / (1000 * 60 * 60 * 24))
      
      return {
        createdAt: creationEvent.eventDate,
        ageInDays,
      }
    }
    
    return {}
  } catch {
    // RDAP échoué, essayer avec l'API WHOIS alternative
    return getDomainAgeWhois(domain)
  }
}

// Fallback WHOIS via API publique
async function getDomainAgeWhois(domain: string): Promise<{ createdAt?: string; ageInDays?: number }> {
  try {
    // Utiliser l'API whois.free.ai (gratuit, limité)
    const response = await fetch(`https://whois.freeai.dev/v1/whois?domain=${domain}`, {
      next: { revalidate: 86400 },
    })
    
    if (!response.ok) {
      return {}
    }
    
    const data = await response.json()
    
    const createdDate = data.created_date || data.creation_date
    if (createdDate) {
      const created = new Date(createdDate)
      const ageInDays = Math.floor((Date.now() - created.getTime()) / (1000 * 60 * 60 * 24))
      
      return {
        createdAt: createdDate,
        ageInDays,
      }
    }
    
    return {}
  } catch {
    return {}
  }
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