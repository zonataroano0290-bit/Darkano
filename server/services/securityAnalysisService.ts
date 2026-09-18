import dns from 'node:dns/promises';
import tls from 'node:tls';
import { URL } from 'node:url';

export interface SecurityFinding {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  category: string;
  owaspCategory: string;
  description: string;
  impact: string;
  remediation: string;
}

export interface DnsAuditResult {
  aRecords: string[];
  aaaaRecords: string[];
  mxRecords: Array<{ exchange: string; priority: number }>;
  txtRecords: string[];
  nsRecords: string[];
  caaRecords: Array<any>;
  hasSpf: boolean;
  hasDmarc: boolean;
  hasCaa: boolean;
  hasIpv6: boolean;
}

export interface TlsAuditResult {
  protocol?: string;
  cipherSuite?: string;
  cipherVersion?: string;
  issuer?: string;
  subject?: string;
  validFrom?: string;
  validTo?: string;
  daysRemaining?: number;
  isExpired?: boolean;
  isSelfSigned?: boolean;
  sans?: string[];
  error?: string;
}

export interface HttpAuditResult {
  finalUrl: string;
  statusCode: number;
  statusText: string;
  responseTimeMs: number;
  redirects: Array<{ from: string; to: string; status: number }>;
  httpsEnforced: boolean;
  headers: Record<string, string>;
  serverBanner?: string;
  poweredBy?: string;
  csp?: {
    raw?: string;
    hasDefaultSrc: boolean;
    hasScriptSrc: boolean;
    allowsUnsafeInline: boolean;
    allowsUnsafeEval: boolean;
    hasReportUri: boolean;
  };
  hsts?: {
    raw?: string;
    maxAge?: number;
    includeSubDomains: boolean;
    preload: boolean;
  };
  xFrameOptions?: string;
  xContentTypeOptions?: string;
  referrerPolicy?: string;
  permissionsPolicy?: string;
  corsPolicy?: string;
  cookies: Array<{
    name: string;
    isSecure: boolean;
    isHttpOnly: boolean;
    sameSite?: string;
  }>;
}

export interface UrlSecurityAnalysis {
  targetUrl: string;
  hostname: string;
  timestamp: string;
  score: number; // 0 - 100
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  summary: string;
  dns: DnsAuditResult;
  tls: TlsAuditResult;
  http: HttpAuditResult;
  findings: SecurityFinding[];
  recommendedPlaybook: string[];
}

export class SecurityAnalysisService {
  /**
   * Normalize input into a valid target URL and extract hostname.
   */
  static normalizeUrl(input: string): { url: string; hostname: string } {
    let raw = input.trim();
    if (!/^https?:\/\//i.test(raw)) {
      raw = `https://${raw}`;
    }

    const parsed = new URL(raw);
    const hostname = parsed.hostname.toLowerCase();

    // Prevent loopback, RFC 1918 internal, and metadata IPs
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '169.254.169.254' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      hostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./)
    ) {
      throw new Error('Analysis of internal, private, loopback, or cloud-metadata addresses is strictly prohibited.');
    }

    return { url: parsed.toString(), hostname };
  }

  /**
   * Real DNS enumeration and email spoofing resilience checks.
   */
  static async auditDns(hostname: string): Promise<DnsAuditResult> {
    const [aResult, aaaaResult, mxResult, txtResult, nsResult, caaResult] = await Promise.allSettled([
      dns.resolve4(hostname),
      dns.resolve6(hostname),
      dns.resolveMx(hostname),
      dns.resolveTxt(hostname),
      dns.resolveNs(hostname),
      dns.resolveCaa(hostname)
    ]);

    const aRecords = aResult.status === 'fulfilled' ? aResult.value : [];
    const aaaaRecords = aaaaResult.status === 'fulfilled' ? aaaaResult.value : [];
    const mxRecords = mxResult.status === 'fulfilled' ? mxResult.value : [];
    const rawTxt = txtResult.status === 'fulfilled' ? txtResult.value : [];
    const txtRecords = rawTxt.map(parts => parts.join(' '));
    const nsRecords = nsResult.status === 'fulfilled' ? nsResult.value : [];
    const caaRecords = caaResult.status === 'fulfilled' ? caaResult.value : [];

    // Check for SPF
    const hasSpf = txtRecords.some(t => t.toLowerCase().includes('v=spf1'));

    // Check for DMARC (on _dmarc.domain)
    let hasDmarc = false;
    try {
      const dmarcTxt = await dns.resolveTxt(`_dmarc.${hostname}`);
      hasDmarc = dmarcTxt.some(parts => parts.join(' ').toLowerCase().includes('v=dmarc1'));
    } catch {
      hasDmarc = false;
    }

    return {
      aRecords,
      aaaaRecords,
      mxRecords,
      txtRecords,
      nsRecords,
      caaRecords,
      hasSpf,
      hasDmarc,
      hasCaa: caaRecords.length > 0,
      hasIpv6: aaaaRecords.length > 0
    };
  }

  /**
   * Real TLS handshake inspection via TLS socket.
   */
  static async auditTls(hostname: string, port = 443): Promise<TlsAuditResult> {
    return new Promise(resolve => {
      const socket = tls.connect(
        {
          host: hostname,
          port,
          servername: hostname,
          timeout: 4500,
          rejectUnauthorized: false // examine even untrusted or self-signed certs
        },
        () => {
          try {
            const cert = socket.getPeerCertificate(true);
            const cipher = socket.getCipher();
            const proto = socket.getProtocol();

            const validFrom = cert.valid_from;
            const validTo = cert.valid_to;
            const now = Date.now();
            const expires = validTo ? new Date(validTo).getTime() : 0;
            const daysRemaining = expires > 0 ? Math.floor((expires - now) / (1000 * 60 * 60 * 24)) : undefined;
            const isExpired = daysRemaining !== undefined ? daysRemaining < 0 : false;
            const isSelfSigned = cert.issuer?.CN === cert.subject?.CN && Boolean(cert.issuer?.CN);

            let sans: string[] = [];
            if (cert.subjectaltname) {
              sans = cert.subjectaltname.split(',').map(s => s.trim().replace(/^DNS:/, ''));
            }

            const formatCertField = (val: string | string[] | undefined): string | undefined => Array.isArray(val) ? val.join(', ') : val;
            const issuerStr = formatCertField(cert.issuer?.O) || formatCertField(cert.issuer?.CN) || 'Unknown Certificate Authority';
            const subjectStr = formatCertField(cert.subject?.CN) || formatCertField(cert.subject?.O) || hostname;

            socket.end();
            resolve({
              protocol: proto || undefined,
              cipherSuite: cipher?.name,
              cipherVersion: cipher?.version,
              issuer: issuerStr,
              subject: subjectStr,
              validFrom,
              validTo,
              daysRemaining,
              isExpired,
              isSelfSigned,
              sans: sans.slice(0, 8)
            });
          } catch (err: any) {
            socket.destroy();
            resolve({ error: err.message || 'Failed to parse peer certificate.' });
          }
        }
      );

      socket.on('error', err => {
        resolve({ error: `TLS Handshake failure: ${err.message}` });
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve({ error: 'TLS Handshake timed out after 4.5s.' });
      });
    });
  }

  /**
   * Real HTTP probe with redirect history and deep header auditing.
   */
  static async auditHttp(targetUrl: string): Promise<HttpAuditResult> {
    const startTime = Date.now();
    const redirects: Array<{ from: string; to: string; status: number }> = [];

    let currentUrl = targetUrl;
    let res: Response | null = null;
    let finalUrl = targetUrl;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    try {
      // Follow redirects manually up to 5 hops to trace transport evolution
      for (let hop = 0; hop < 5; hop++) {
        const response = await fetch(currentUrl, {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Darkano-Security-Scanner/3.0; +https://darkano.ai/scanner)',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5'
          }
        });

        res = response;
        finalUrl = currentUrl;

        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const loc = response.headers.get('location');
          if (loc) {
            const nextUrl = new URL(loc, currentUrl).toString();
            redirects.push({ from: currentUrl, to: nextUrl, status: response.status });
            currentUrl = nextUrl;
            continue;
          }
        }
        break;
      }
    } finally {
      clearTimeout(timeoutId);
    }

    if (!res) {
      throw new Error(`Failed to reach endpoint: ${targetUrl}`);
    }

    const responseTimeMs = Date.now() - startTime;
    const rawHeaders: Record<string, string> = {};
    res.headers.forEach((val, key) => {
      rawHeaders[key.toLowerCase()] = val;
    });

    const httpsEnforced = finalUrl.startsWith('https://');

    // Parse CSP
    const cspHeader = rawHeaders['content-security-policy'];
    let cspParsed: HttpAuditResult['csp'] = undefined;
    if (cspHeader) {
      const lower = cspHeader.toLowerCase();
      cspParsed = {
        raw: cspHeader,
        hasDefaultSrc: lower.includes('default-src'),
        hasScriptSrc: lower.includes('script-src'),
        allowsUnsafeInline: lower.includes("'unsafe-inline'"),
        allowsUnsafeEval: lower.includes("'unsafe-eval'"),
        hasReportUri: lower.includes('report-uri') || lower.includes('report-to')
      };
    }

    // Parse HSTS
    const hstsHeader = rawHeaders['strict-transport-security'];
    let hstsParsed: HttpAuditResult['hsts'] = undefined;
    if (hstsHeader) {
      const maxAgeMatch = hstsHeader.match(/max-age=(\d+)/i);
      hstsParsed = {
        raw: hstsHeader,
        maxAge: maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : undefined,
        includeSubDomains: /includesubdomains/i.test(hstsHeader),
        preload: /preload/i.test(hstsHeader)
      };
    }

    // Parse Cookies
    const cookies: HttpAuditResult['cookies'] = [];
    const rawCookies = res.headers.get('set-cookie');
    if (rawCookies) {
      // Split individual cookie strings
      const cookieSegments = rawCookies.split(/,(?=\s*[^;]+=[^;]+)/g);
      for (const segment of cookieSegments) {
        const parts = segment.split(';').map(s => s.trim());
        const nameVal = parts[0];
        const eqIdx = nameVal.indexOf('=');
        const cookieName = eqIdx > 0 ? nameVal.substring(0, eqIdx) : nameVal;
        const lowerParts = parts.map(p => p.toLowerCase());

        const isSecure = lowerParts.some(p => p === 'secure');
        const isHttpOnly = lowerParts.some(p => p === 'httponly');
        const sameSitePart = parts.find(p => p.toLowerCase().startsWith('samesite='));
        const sameSite = sameSitePart ? sameSitePart.split('=')[1] : undefined;

        cookies.push({
          name: cookieName,
          isSecure,
          isHttpOnly,
          sameSite
        });
      }
    }

    return {
      finalUrl,
      statusCode: res.status,
      statusText: res.statusText,
      responseTimeMs,
      redirects,
      httpsEnforced,
      headers: rawHeaders,
      serverBanner: rawHeaders['server'],
      poweredBy: rawHeaders['x-powered-by'],
      csp: cspParsed,
      hsts: hstsParsed,
      xFrameOptions: rawHeaders['x-frame-options'],
      xContentTypeOptions: rawHeaders['x-content-type-options'],
      referrerPolicy: rawHeaders['referrer-policy'],
      permissionsPolicy: rawHeaders['permissions-policy'] || rawHeaders['feature-policy'],
      corsPolicy: rawHeaders['access-control-allow-origin'],
      cookies
    };
  }

  /**
   * Execute full end-to-end security analysis on the target.
   */
  static async analyze(rawUrl: string): Promise<UrlSecurityAnalysis> {
    const { url, hostname } = this.normalizeUrl(rawUrl);

    // Parallel execution of DNS, TLS, and HTTP probes
    const [dnsResult, tlsResult, httpResult] = await Promise.all([
      this.auditDns(hostname).catch(err => ({
        aRecords: [],
        aaaaRecords: [],
        mxRecords: [],
        txtRecords: [],
        nsRecords: [],
        caaRecords: [],
        hasSpf: false,
        hasDmarc: false,
        hasCaa: false,
        hasIpv6: false,
        error: err.message
      } as DnsAuditResult)),
      this.auditTls(hostname).catch(err => ({
        error: `TLS probe failed: ${err.message}`
      } as TlsAuditResult)),
      this.auditHttp(url).catch(err => {
        throw new Error(`Failed to probe HTTP/HTTPS interface: ${err.message}`);
      })
    ]);

    // Evaluate findings & compute security posture score
    const findings: SecurityFinding[] = [];
    let score = 100;

    // 1. HTTPS / Encryption Enforcement
    if (!httpResult.httpsEnforced) {
      score -= 30;
      findings.push({
        id: 'SEC-TLS-001',
        severity: 'critical',
        title: 'Plaintext HTTP Transport (Unencrypted Traffic)',
        category: 'Transport Security',
        owaspCategory: 'A02:2021-Cryptographic Failures',
        description: 'The web application serves content over unencrypted HTTP or fails to enforce automatic HTTPS redirection.',
        impact: 'Adversaries on the same network or upstream ISP can eavesdrop on credentials, session tokens, and inject malicious scripts via Man-In-The-Middle (MITM).',
        remediation: 'Implement HTTP 301 Permanent Redirect to HTTPS on port 80 and enforce TLS across all application routes.'
      });
    }

    // 2. TLS Protocol Version & Cert Expiration
    if (tlsResult.isExpired) {
      score -= 35;
      findings.push({
        id: 'SEC-TLS-002',
        severity: 'critical',
        title: 'Expired TLS Certificate',
        category: 'Certificate Authority',
        owaspCategory: 'A02:2021-Cryptographic Failures',
        description: `The SSL/TLS certificate for ${hostname} expired on ${tlsResult.validTo}.`,
        impact: 'Browsers reject connections with severe security warnings; breaks automated API clients and leaves users vulnerable to forged certificates.',
        remediation: 'Immediately renew the TLS certificate and configure automated renewal via ACME / certbot.'
      });
    } else if (tlsResult.daysRemaining !== undefined && tlsResult.daysRemaining <= 14) {
      score -= 10;
      findings.push({
        id: 'SEC-TLS-003',
        severity: 'medium',
        title: 'Impending TLS Certificate Expiration',
        category: 'Certificate Authority',
        owaspCategory: 'A02:2021-Cryptographic Failures',
        description: `The SSL/TLS certificate expires in ${tlsResult.daysRemaining} days (${tlsResult.validTo}).`,
        impact: 'Service disruption and browser trust revocation if certificate expiration occurs.',
        remediation: 'Trigger immediate automated certificate renewal check.'
      });
    }

    if (tlsResult.protocol === 'TLSv1' || tlsResult.protocol === 'TLSv1.1') {
      score -= 25;
      findings.push({
        id: 'SEC-TLS-004',
        severity: 'high',
        title: 'Deprecated TLS Protocol Active (TLS 1.0/1.1)',
        category: 'Transport Security',
        owaspCategory: 'A02:2021-Cryptographic Failures',
        description: `The server negotiated ${tlsResult.protocol}, which contains known cryptographic flaws (POODLE, BEAST).`,
        impact: 'Cryptographic degradation and compliance failure (PCI-DSS violation).',
        remediation: 'Disable TLS 1.0 and TLS 1.1 in web server/load balancer config; enforce TLS 1.2 and TLS 1.3 only.'
      });
    }

    // 3. Content-Security-Policy (CSP)
    if (!httpResult.csp) {
      score -= 18;
      findings.push({
        id: 'SEC-HDR-001',
        severity: 'high',
        title: 'Missing Content-Security-Policy (CSP)',
        category: 'Browser Hardening',
        owaspCategory: 'A03:2021-Injection',
        description: 'No Content-Security-Policy header was returned in the HTTP response.',
        impact: 'The browser cannot restrict the execution of injected malicious scripts, significantly increasing risk from Cross-Site Scripting (XSS) and data exfiltration.',
        remediation: "Define a strict CSP header (e.g. Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-...'; object-src 'none'; base-uri 'self')."
      });
    } else {
      if (httpResult.csp.allowsUnsafeInline && !httpResult.csp.hasScriptSrc) {
        score -= 8;
        findings.push({
          id: 'SEC-HDR-002',
          severity: 'medium',
          title: "CSP Contains 'unsafe-inline' Directives",
          category: 'Browser Hardening',
          owaspCategory: 'A03:2021-Injection',
          description: "The CSP directive contains 'unsafe-inline', weakening defensive protection against reflected and stored XSS.",
          impact: 'Injected HTML tags or inline scripts can execute arbitrary JavaScript in victim sessions.',
          remediation: "Eliminate 'unsafe-inline' by adopting cryptographic nonces (nonce-*) or SHA-256 hashes for authorized scripts."
        });
      }
    }

    // 4. Strict-Transport-Security (HSTS)
    if (!httpResult.hsts) {
      score -= 15;
      findings.push({
        id: 'SEC-HDR-003',
        severity: 'medium',
        title: 'Missing HTTP Strict Transport Security (HSTS)',
        category: 'Transport Security',
        owaspCategory: 'A05:2021-Security Misconfiguration',
        description: 'The server does not transmit the Strict-Transport-Security header.',
        impact: 'Users making initial HTTP requests are vulnerable to SSL-stripping and downgrade attacks before HTTPS redirection occurs.',
        remediation: 'Add Strict-Transport-Security: max-age=31536000; includeSubDomains; preload to production response headers.'
      });
    } else if (httpResult.hsts.maxAge !== undefined && httpResult.hsts.maxAge < 10368000) {
      score -= 5;
      findings.push({
        id: 'SEC-HDR-004',
        severity: 'low',
        title: 'Short HSTS Cache Duration',
        category: 'Transport Security',
        owaspCategory: 'A05:2021-Security Misconfiguration',
        description: `HSTS max-age is set to ${httpResult.hsts.maxAge}s, which is below the recommended 1-year threshold (31536000s).`,
        impact: 'Short cache durations reduce long-term protection against SSL stripping.',
        remediation: 'Increase max-age to at least 31536000 (1 year).'
      });
    }

    // 5. X-Frame-Options (Clickjacking)
    if (!httpResult.xFrameOptions && (!httpResult.csp || !httpResult.csp.raw?.includes('frame-ancestors'))) {
      score -= 12;
      findings.push({
        id: 'SEC-HDR-005',
        severity: 'medium',
        title: 'Missing Clickjacking Protection (X-Frame-Options / frame-ancestors)',
        category: 'Browser Hardening',
        owaspCategory: 'A05:2021-Security Misconfiguration',
        description: 'The endpoint does not specify X-Frame-Options or CSP frame-ancestors.',
        impact: 'Third-party malicious websites can iframe this application to trick authenticated users into executing unauthorized actions (UI Redress Attack).',
        remediation: "Set X-Frame-Options: DENY or SAMEORIGIN, or configure frame-ancestors 'none' in CSP."
      });
    }

    // 6. X-Content-Type-Options
    if (!httpResult.xContentTypeOptions || httpResult.xContentTypeOptions.toLowerCase() !== 'nosniff') {
      score -= 6;
      findings.push({
        id: 'SEC-HDR-006',
        severity: 'low',
        title: 'Missing X-Content-Type-Options: nosniff',
        category: 'Browser Hardening',
        owaspCategory: 'A05:2021-Security Misconfiguration',
        description: 'The X-Content-Type-Options header is missing or not set to nosniff.',
        impact: 'Allows older browsers to MIME-sniff response bodies, potentially executing non-executable files as JavaScript.',
        remediation: 'Add X-Content-Type-Options: nosniff to all HTTP responses.'
      });
    }

    // 7. Server / Technology Banner Leakage
    if (httpResult.serverBanner || httpResult.poweredBy) {
      const banner = [httpResult.serverBanner, httpResult.poweredBy].filter(Boolean).join(' / ');
      score -= 5;
      findings.push({
        id: 'SEC-INFO-001',
        severity: 'low',
        title: 'Server Software Fingerprint Disclosure',
        category: 'Information Disclosure',
        owaspCategory: 'A05:2021-Security Misconfiguration',
        description: `The application reveals internal server technology banners in response headers: "${banner}".`,
        impact: 'Facilitates automated reconnaissance by attackers seeking known vulnerabilities for specific software versions.',
        remediation: 'Disable server signature tokens in web server config (e.g. server_tokens off; in Nginx, ServerSignature Off in Apache, app.disable("x-powered-by") in Express).'
      });
    }

    // 8. Cookie Security Flags
    const insecureCookies = httpResult.cookies.filter(c => !c.isSecure || !c.isHttpOnly);
    if (insecureCookies.length > 0) {
      score -= 10;
      findings.push({
        id: 'SEC-CK-001',
        severity: 'medium',
        title: 'Insecure Cookie Attributes Detected',
        category: 'Session Management',
        owaspCategory: 'A07:2021-Identification and Authentication Failures',
        description: `Cookies (${insecureCookies.map(c => c.name).join(', ')}) lack Secure or HttpOnly flags.`,
        impact: 'Cookies lacking HttpOnly are readable via XSS document.cookie; cookies lacking Secure can leak over unencrypted channels.',
        remediation: 'Append ; Secure; HttpOnly; SameSite=Strict (or Lax) to all Set-Cookie directives.'
      });
    }

    // 9. DNS Security: SPF and DMARC
    if (!dnsResult.hasSpf) {
      score -= 5;
      findings.push({
        id: 'SEC-DNS-001',
        severity: 'low',
        title: 'Missing Sender Policy Framework (SPF) Record',
        category: 'DNS & Email Security',
        owaspCategory: 'A05:2021-Security Misconfiguration',
        description: 'No TXT record with v=spf1 was detected on the root domain.',
        impact: 'Adversaries can forge phishing emails appearing to originate from this domain.',
        remediation: 'Publish a valid SPF record in DNS (e.g. v=spf1 include:_spf.google.com ~all).'
      });
    }

    if (!dnsResult.hasDmarc) {
      score -= 5;
      findings.push({
        id: 'SEC-DNS-002',
        severity: 'low',
        title: 'Missing DMARC Policy Record',
        category: 'DNS & Email Security',
        owaspCategory: 'A05:2021-Security Misconfiguration',
        description: 'No _dmarc TXT record detected.',
        impact: 'Mail servers cannot enforce strict rejection or quarantine policies for spoofed messages.',
        remediation: 'Configure a DMARC policy at _dmarc.<domain> (e.g. v=DMARC1; p=reject; rua=mailto:dmarc-reports@domain).'
      });
    }

    // Clamp score
    score = Math.max(0, Math.min(100, score));

    // Grade calculation
    let grade: UrlSecurityAnalysis['grade'] = 'F';
    if (score >= 95) grade = 'A+';
    else if (score >= 85) grade = 'A';
    else if (score >= 70) grade = 'B';
    else if (score >= 55) grade = 'C';
    else if (score >= 40) grade = 'D';
    else grade = 'F';

    // Risk level
    let riskLevel: UrlSecurityAnalysis['riskLevel'] = 'LOW';
    if (findings.some(f => f.severity === 'critical')) riskLevel = 'CRITICAL';
    else if (findings.some(f => f.severity === 'high')) riskLevel = 'HIGH';
    else if (findings.some(f => f.severity === 'medium')) riskLevel = 'MEDIUM';

    // Recommended Playbook
    const recommendedPlaybook = [
      '1. Implement strict Content-Security-Policy (CSP) with script nonces and restricted object/base origins.',
      '2. Enable HTTP Strict Transport Security (HSTS) with max-age=31536000 and includeSubDomains.',
      '3. Enforce X-Frame-Options: DENY or CSP frame-ancestors to eliminate clickjacking surfaces.',
      '4. Strip identifying server software banners (Server, X-Powered-By) to prevent reconnaissance.',
      '5. Verify all authentication and session cookies include Secure, HttpOnly, and SameSite attributes.',
      '6. Establish DMARC and SPF DNS policies to protect domain reputation against phishing abuse.'
    ];

    const summary = `Darkano live probe scanned ${hostname} across DNS, TLS 1.3, HTTP transport, and OWASP hardening headers. Overall Security Posture: Score ${score}/100 (Grade ${grade}), Risk Rating: ${riskLevel}. Identified ${findings.length} findings (${findings.filter(f => f.severity === 'critical' || f.severity === 'high').length} high/critical priority).`;

    return {
      targetUrl: url,
      hostname,
      timestamp: new Date().toISOString(),
      score,
      grade,
      riskLevel,
      summary,
      dns: dnsResult,
      tls: tlsResult,
      http: httpResult,
      findings,
      recommendedPlaybook
    };
  }

  /**
   * Format structured analysis into high-fidelity markdown telemetry for Darkano AI.
   */
  static formatTelemetryPrompt(analysis: UrlSecurityAnalysis): string {
    const findingsList = analysis.findings
      .map(
        f =>
          `- [${f.severity.toUpperCase()}] **${f.title}** (${f.owaspCategory})\n  *Impact*: ${f.impact}\n  *Remediation*: ${f.remediation}`
      )
      .join('\n\n');

    return `
### [DARKANO LIVE CYBER PROBE TELEMETRY]
- **Target URL**: ${analysis.targetUrl}
- **Resolved IP(s)**: ${analysis.dns.aRecords.slice(0, 4).join(', ') || 'None'} ${analysis.dns.aaaaRecords.length ? `(IPv6: ${analysis.dns.aaaaRecords[0]})` : ''}
- **Security Score**: ${analysis.score}/100 | **Grade**: ${analysis.grade} | **Risk Level**: ${analysis.riskLevel}
- **TLS Handshake**: Protocol: ${analysis.tls.protocol || 'Unknown'} | Cipher: ${analysis.tls.cipherSuite || 'Unknown'} | Issuer: ${analysis.tls.issuer || 'Unknown'} | Cert Valid Until: ${analysis.tls.validTo || 'Unknown'}
- **HTTP Response**: Status ${analysis.http.statusCode} (${analysis.http.responseTimeMs}ms) | Server Banner: ${analysis.http.serverBanner || 'Hidden'} | Powered-By: ${analysis.http.poweredBy || 'Hidden'}
- **HSTS Configured**: ${analysis.http.hsts ? `Yes (max-age: ${analysis.http.hsts.maxAge || 0}s, includeSubDomains: ${analysis.http.hsts.includeSubDomains})` : 'NO (Vulnerable to SSL Stripping)'}
- **CSP Configured**: ${analysis.http.csp ? 'Yes' : 'NO (Vulnerable to XSS / Data Exfiltration)'}
- **Clickjacking Protection (X-Frame-Options)**: ${analysis.http.xFrameOptions || 'NO (Vulnerable to Clickjacking)'}
- **DNS Hygiene**: SPF: ${analysis.dns.hasSpf ? 'Configured' : 'Missing'} | DMARC: ${analysis.dns.hasDmarc ? 'Configured' : 'Missing'} | CAA: ${analysis.dns.hasCaa ? 'Configured' : 'Missing'}

**Detailed Vulnerabilities Detected (${analysis.findings.length})**:
${findingsList || 'No critical or medium vulnerabilities detected.'}
`.trim();
  }
}
