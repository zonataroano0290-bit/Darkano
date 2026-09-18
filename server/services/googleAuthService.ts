import { OAuth2Client, TokenPayload } from 'google-auth-library';
import { SERVER_CONFIG } from '../config.js';

export interface VerifiedGoogleIdentity {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
}

let cachedOAuthClient: OAuth2Client | null = null;

function getOAuthClient(): OAuth2Client {
  if (!cachedOAuthClient) {
    const clientId = SERVER_CONFIG.googleClientId || process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '';
    cachedOAuthClient = new OAuth2Client(clientId);
  }
  return cachedOAuthClient;
}

export class GoogleAuthService {
  /**
   * Returns current Google Client ID configuration status (safe for public exposure)
   */
  static getConfig() {
    const clientId = SERVER_CONFIG.googleClientId || process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '';
    return {
      configured: Boolean(clientId && clientId.trim().length > 0),
      clientId: clientId.trim()
    };
  }

  /**
   * Cryptographically verifies a Google credential (either ID token or OAuth access token)
   * using Google's official verification servers.
   * Never trusts client-supplied user data.
   */
  static async verifyCredential(credential: string): Promise<VerifiedGoogleIdentity> {
    if (!credential || typeof credential !== 'string' || credential.trim().length === 0) {
      throw new Error('Google credential token is missing or empty');
    }

    const cleanToken = credential.trim();
    // If JWT format (header.payload.signature), verify as ID token
    if (cleanToken.includes('.') && cleanToken.split('.').length === 3) {
      return this.verifyIdToken(cleanToken);
    }

    // Otherwise, verify as Google OAuth2 access token
    return this.verifyAccessToken(cleanToken);
  }

  /**
   * Verifies a Google OAuth2 access token with Google's tokeninfo and userinfo endpoints.
   */
  static async verifyAccessToken(accessToken: string): Promise<VerifiedGoogleIdentity> {
    const config = this.getConfig();
    const expectedClientId = config.clientId;

    // 1. Verify token validity with Google tokeninfo
    const tokenInfoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`);
    if (!tokenInfoRes.ok) {
      throw new Error('Invalid, revoked, or expired Google access token');
    }
    const tokenInfo = await tokenInfoRes.json();

    if (expectedClientId) {
      const tokenAud = tokenInfo.aud || tokenInfo.issued_to;
      if (tokenAud && tokenAud !== expectedClientId) {
        throw new Error('Google access token was not issued for this client ID');
      }
    }

    if (tokenInfo.expires_in && Number(tokenInfo.expires_in) <= 0) {
      throw new Error('Google access token has expired');
    }

    // 2. Retrieve verified userinfo from Google
    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!userInfoRes.ok) {
      throw new Error('Failed to retrieve verified Google user profile');
    }
    const profile = await userInfoRes.json();

    const email = profile.email || tokenInfo.email;
    const sub = profile.sub || tokenInfo.sub || tokenInfo.user_id;
    const emailVerified =
      profile.email_verified === true ||
      profile.email_verified === 'true' ||
      tokenInfo.verified_email === true ||
      tokenInfo.verified_email === 'true';

    if (!emailVerified) {
      throw new Error('Google account email is not verified by Google');
    }

    if (!email || typeof email !== 'string') {
      throw new Error('Google credential does not contain a valid email address');
    }

    if (!sub || typeof sub !== 'string') {
      throw new Error('Google credential does not contain a valid subject identity');
    }

    return {
      sub: String(sub),
      email: String(email).trim().toLowerCase(),
      email_verified: true,
      name: profile.name ? String(profile.name).trim() : undefined,
      picture: profile.picture ? String(profile.picture).trim() : undefined,
      given_name: profile.given_name ? String(profile.given_name).trim() : undefined,
      family_name: profile.family_name ? String(profile.family_name).trim() : undefined
    };
  }

  /**
   * Cryptographically verifies a Google ID token using Google's official verification system.
   */
  static async verifyIdToken(idToken: string): Promise<VerifiedGoogleIdentity> {
    if (!idToken || typeof idToken !== 'string' || idToken.trim().length === 0) {
      throw new Error('Google credential token is missing or empty');
    }

    const cleanToken = idToken.trim();
    const config = this.getConfig();
    const expectedClientId = config.clientId;

    // 1. Primary verification via official google-auth-library
    if (expectedClientId) {
      try {
        const client = getOAuthClient();
        const ticket = await client.verifyIdToken({
          idToken: cleanToken,
          audience: expectedClientId
        });

        const payload = ticket.getPayload();
        if (!payload) {
          throw new Error('Empty payload returned by Google token verification');
        }

        return this.validatePayload(payload, expectedClientId);
      } catch (sdkErr: any) {
        console.warn('[Darkano Auth] google-auth-library verification warning:', sdkErr?.message);
        // If library threw error, attempt secondary validation via Google's official tokeninfo endpoint
      }
    }

    // 2. Official Google tokeninfo verification endpoint
    try {
      const tokenInfoUrl = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(cleanToken)}`;
      const response = await fetch(tokenInfoUrl, {
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error('[Darkano Auth] Google tokeninfo rejected token:', response.status, errorBody);
        throw new Error('Invalid, revoked, or expired Google credential');
      }

      const payload = await response.json();
      return this.validatePayload(payload, expectedClientId);
    } catch (apiErr: any) {
      console.error('[Darkano Auth] Failed to verify Google credential:', apiErr?.message);
      throw new Error(apiErr?.message || 'Failed to verify Google credential');
    }
  }

  /**
   * Internal validator to ensure all security assertions pass
   */
  private static validatePayload(payload: TokenPayload | any, expectedClientId?: string): VerifiedGoogleIdentity {
    // Validate issuer (must be accounts.google.com or https://accounts.google.com)
    const validIssuers = ['accounts.google.com', 'https://accounts.google.com'];
    if (!payload.iss || !validIssuers.includes(payload.iss)) {
      throw new Error('Invalid token issuer: not issued by Google');
    }

    // Validate audience if configured
    if (expectedClientId && payload.aud !== expectedClientId) {
      throw new Error('Google credential was not issued for this application (audience mismatch)');
    }

    // Validate expiration
    if (payload.exp) {
      const nowSeconds = Math.floor(Date.now() / 1000);
      if (Number(payload.exp) < nowSeconds) {
        throw new Error('Google credential has expired');
      }
    }

    // Validate verified email
    const emailVerified = payload.email_verified === true || payload.email_verified === 'true';
    if (!emailVerified) {
      throw new Error('Google account email is not verified by Google');
    }

    if (!payload.email || typeof payload.email !== 'string') {
      throw new Error('Google credential does not contain a valid email address');
    }

    if (!payload.sub || typeof payload.sub !== 'string') {
      throw new Error('Google credential does not contain a valid subject identity');
    }

    return {
      sub: String(payload.sub),
      email: String(payload.email).trim().toLowerCase(),
      email_verified: true,
      name: payload.name ? String(payload.name).trim() : undefined,
      picture: payload.picture ? String(payload.picture).trim() : undefined,
      given_name: payload.given_name ? String(payload.given_name).trim() : undefined,
      family_name: payload.family_name ? String(payload.family_name).trim() : undefined
    };
  }
}
