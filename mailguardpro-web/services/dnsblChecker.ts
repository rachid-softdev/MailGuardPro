// Vérification DNSBL (DNS Blacklist) - IP listée comme spam

import dns from 'dns/promises'
import { CheckResult } from './types'

// Liste des serveurs DNSBL populaires
const DNSBL_SERVERS = [
  { host: 'zen.spamhaus.org', name: 'Spamhaus Zen' },
  { host: 'bl.spamcop.net', name: 'SpamCop BL' },
  { host: 'dnsbl.sorbs.net', name: 'SORBS' },
  { host: 'spam.dnsbl.sorbs.net', name: 'SORBS Spam' },
  { host: 'web.dnsbl.sorbs.net', name: 'SORBS Web' },
]

async function checkIPBlacklist(ip: string, dnsbl: string): Promise<{ listed: boolean; details?: string }> {
  try {
    // Inverser l'IP pour le query DNSBL
    const reversedIP = ip.split('.').reverse().join('.')
    const lookupHost = `${reversedIP}.${dnsbl}`
    
    // Résoudre l'adresse
    const addresses = await dns.resolve4(lookupHost)
    
    if (addresses && addresses.length > 0) {
      // L'IP est listée
      // Le premier octet de l'IP retournée indique le type de listing
      const returnCode = addresses[0].split('.')[0]
      
      let details: string | undefined
      switch (returnCode) {
        case '127':
          details = 'Listé comme source de spam'
          break
        case '64':
          details = 'Listé comme sender open relay'
          break
        case '2':
          details = 'Listé comme domainpike'
          break
        default:
          details = `Listé (code: ${returnCode})`
      }
      
      return { listed: true, details }
    }
    
    return { listed: false }
  } catch {
    // NXDOMAIN = pas listé, ou erreur DNS
    return { listed: false }
  }
}

export async function checkDNSBL(domain: string): Promise<CheckResult> {
  try {
    // Résoudre les adresses IP du domaine
    let addresses: string[] = []
    try {
      addresses = await dns.resolve4(domain)
    } catch {
      // Impossible de résoudre → pas de blacklist check
      return {
        passed: true,
        weight: 20,
        message: 'Vérification impossible',
        detail: 'Impossible de résoudre les IP du domaine',
      }
    }
    
    if (!addresses || addresses.length === 0) {
      return {
        passed: true,
        weight: 0,
        message: 'Aucune IP trouvée',
      }
    }
    
    // Vérifier chaque IP contre chaque DNSBL
    for (const ip of addresses) {
      for (const dnsbl of DNSBL_SERVERS) {
        const result = await checkIPBlacklist(ip, dnsbl.host)
        
        if (result.listed) {
          return {
            passed: false,
            weight: 20,
            message: `IP blacklistée sur ${dnsbl.name}`,
            detail: `${ip} est listée sur ${dnsbl.host}: ${result.details}`,
          }
        }
      }
    }
    
    return {
      passed: true,
      weight: 0,
      message: 'Non blacklisté',
      detail: undefined,
    }
  } catch (error) {
    return {
      passed: true,
      weight: 0,
      message: 'Vérification échouée',
      detail: error instanceof Error ? error.message : 'Erreur inconnue',
    }
  }
}