/**
 * Google Identity Services (GIS) Browser SDK Loader & Manager
 * Robustly loads the official SDK from https://accounts.google.com/gsi/client
 * with strict lifecycle management, retry capability, and zero unhandled errors.
 */

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (config: any) => void;
          prompt: (callback?: (notification: any) => void) => void;
          renderButton: (parent: HTMLElement, options: any) => void;
          disableAutoSelect: () => void;
          revoke: (hint: string, callback?: (done: any) => void) => void;
        };
        oauth2?: {
          initTokenClient: (config: any) => {
            requestAccessToken: (overrideConfig?: any) => void;
          };
          initCodeClient?: (config: any) => any;
          hasGrantedAllScopes?: (tokenResponse: any, ...scopes: string[]) => boolean;
          hasGrantedAnyScope?: (tokenResponse: any, ...scopes: string[]) => boolean;
          revoke?: (token: string, callback?: () => void) => void;
        };
      };
    };
  }
}

const GSI_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
const GSI_SCRIPT_ID = 'google-identity-services-sdk';

let loadPromise: Promise<boolean> | null = null;

/**
 * Checks whether the GIS SDK is already loaded on window.google.accounts
 */
export function isGoogleSdkLoaded(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(window.google?.accounts?.id || window.google?.accounts?.oauth2);
}

/**
 * Loads the official Google Identity Services browser SDK from Google's endpoint.
 * Returns a promise that resolves true when loaded, or rejects with an actionable error.
 */
export function loadGoogleSdk(forceReload = false): Promise<boolean> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Browser environment is required to load Google Identity Services'));
  }

  // If already loaded and not forcing reload, resolve immediately
  if (!forceReload && isGoogleSdkLoaded()) {
    return Promise.resolve(true);
  }

  // Return existing in-flight loading promise if not forcing reload
  if (!forceReload && loadPromise) {
    return loadPromise;
  }

  loadPromise = new Promise<boolean>((resolve, reject) => {
    // If forcing reload, remove any previous failed script tag
    if (forceReload) {
      const existingScript = document.getElementById(GSI_SCRIPT_ID);
      if (existingScript && existingScript.parentNode) {
        existingScript.parentNode.removeChild(existingScript);
      }
    }

    // Check if script is already in DOM
    let script = document.getElementById(GSI_SCRIPT_ID) as HTMLScriptElement | null;

    // Also check for any script pointing to accounts.google.com/gsi/client
    if (!script) {
      const allScripts = Array.from(document.querySelectorAll('script'));
      const found = allScripts.find(s => s.src && s.src.includes('accounts.google.com/gsi/client'));
      if (found) {
        script = found;
        script.id = GSI_SCRIPT_ID;
      }
    }

    const checkSdkReadiness = (attemptsLeft = 20, intervalMs = 50) => {
      if (isGoogleSdkLoaded()) {
        resolve(true);
        return;
      }
      if (attemptsLeft > 0) {
        setTimeout(() => checkSdkReadiness(attemptsLeft - 1, intervalMs), intervalMs);
      } else {
        reject(
          new Error(
            'Google Identity Services script loaded but Google accounts object was not initialized. Please verify your connection.'
          )
        );
      }
    };

    // Timeout safety
    const timeoutId = setTimeout(() => {
      if (isGoogleSdkLoaded()) {
        resolve(true);
      } else {
        loadPromise = null;
        reject(
          new Error(
            'Timed out while loading Google Identity Services. Please check your network or ad blocker and try again.'
          )
        );
      }
    }, 12000);

    const onScriptLoadSuccess = () => {
      clearTimeout(timeoutId);
      checkSdkReadiness();
    };

    const onScriptLoadFailure = (event: any) => {
      clearTimeout(timeoutId);
      loadPromise = null;
      console.error('[GoogleAuthLoader] Failed to load GSI SDK:', event);
      reject(
        new Error(
          'Failed to load Google Identity Services SDK from accounts.google.com. Please check your network connection or ad blocker and try again.'
        )
      );
    };

    if (script) {
      // If script exists and already completed
      if (isGoogleSdkLoaded()) {
        clearTimeout(timeoutId);
        resolve(true);
        return;
      }

      // Attach event listeners to existing script
      script.addEventListener('load', onScriptLoadSuccess, { once: true });
      script.addEventListener('error', onScriptLoadFailure, { once: true });
    } else {
      // Create and inject fresh script tag
      const newScript = document.createElement('script');
      newScript.id = GSI_SCRIPT_ID;
      newScript.src = GSI_SCRIPT_URL;
      newScript.async = true;
      newScript.defer = true;
      newScript.onload = onScriptLoadSuccess;
      newScript.onerror = onScriptLoadFailure;

      (document.head || document.body || document.documentElement).appendChild(newScript);
    }
  });

  return loadPromise;
}

/**
 * Initializes GIS One-Tap / ID credential listener once SDK is confirmed ready.
 */
export function initializeGoogleIdClient(
  clientId: string,
  onCredentialReceived: (credential: string) => Promise<void> | void,
  onError?: (err: Error) => void
): boolean {
  if (!isGoogleSdkLoaded() || !window.google?.accounts?.id) {
    return false;
  }

  try {
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async (response: { credential?: string }) => {
        if (response?.credential) {
          try {
            await onCredentialReceived(response.credential);
          } catch (err: any) {
            onError?.(err instanceof Error ? err : new Error(String(err)));
          }
        }
      },
      auto_select: false,
      cancel_on_tap_outside: true,
      itp_support: true
    });
    return true;
  } catch (initErr: any) {
    console.warn('[GoogleAuthLoader] initializeGoogleIdClient warning:', initErr);
    onError?.(initErr instanceof Error ? initErr : new Error(String(initErr)));
    return false;
  }
}

/**
 * Triggers Google One-Tap / FedCM credential prompt if available in the browser.
 */
export function promptGoogleOneTap(onNotification?: (notification: any) => void): void {
  if (typeof window !== 'undefined' && window.google?.accounts?.id?.prompt) {
    try {
      window.google.accounts.id.prompt(onNotification);
    } catch (err) {
      console.warn('[GoogleAuthLoader] promptGoogleOneTap warning:', err);
    }
  }
}

/**
 * Renders the official Sign In With Google button into a container element.
 * The official button handles FedCM and direct click events natively without popup issues.
 */
export function renderGoogleSignInButton(
  container: HTMLElement,
  options?: {
    theme?: 'outline' | 'filled_blue' | 'filled_black';
    size?: 'large' | 'medium' | 'small';
    text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
    shape?: 'rectangular' | 'pill' | 'circle' | 'square';
    logo_alignment?: 'left' | 'center';
    width?: number;
  }
): boolean {
  if (!isGoogleSdkLoaded() || !window.google?.accounts?.id?.renderButton) {
    return false;
  }

  try {
    window.google.accounts.id.renderButton(container, {
      type: 'standard',
      theme: 'filled_black',
      size: 'large',
      text: 'continue_with',
      shape: 'rectangular',
      logo_alignment: 'left',
      width: 340,
      ...options
    });
    return true;
  } catch (err: any) {
    console.warn('[GoogleAuthLoader] renderGoogleSignInButton error:', err);
    return false;
  }
}

// Global cached TokenClient instance and active callbacks
let cachedTokenClient: any = null;
let currentTokenCallbacks: {
  onSuccess: (accessToken: string) => Promise<void> | void;
  onError: (err: Error) => void;
  onCancel?: () => void;
} | null = null;

/**
 * Pre-initializes the OAuth2 Token Client so popup invocation happens synchronously on click
 * without waiting for asynchronous setup that causes browsers to drop user activation.
 */
export function initOAuth2TokenClient(
  clientId: string,
  onSuccess: (accessToken: string) => Promise<void> | void,
  onError: (err: Error) => void,
  onCancel?: () => void
): boolean {
  if (!isGoogleSdkLoaded() || !window.google?.accounts?.oauth2) {
    return false;
  }

  currentTokenCallbacks = { onSuccess, onError, onCancel };

  try {
    cachedTokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'openid email profile',
      callback: async (tokenResponse: any) => {
        const cbs = currentTokenCallbacks;
        if (!tokenResponse) {
          cbs?.onCancel?.();
          return;
        }

        if (tokenResponse.error) {
          if (tokenResponse.error === 'access_denied') {
            cbs?.onCancel?.();
          } else {
            cbs?.onError(
              new Error(`Google authentication failed: ${tokenResponse.error_description || tokenResponse.error}`)
            );
          }
          return;
        }

        if (tokenResponse.access_token) {
          try {
            await cbs?.onSuccess(tokenResponse.access_token);
          } catch (authErr: any) {
            cbs?.onError(authErr instanceof Error ? authErr : new Error(String(authErr)));
          }
        } else {
          cbs?.onCancel?.();
        }
      },
      error_callback: (err: any) => {
        console.warn('[GoogleAuthLoader] OAuth2 error callback:', err);
        const cbs = currentTokenCallbacks;

        if (err?.type === 'popup_closed') {
          cbs?.onCancel?.();
          return;
        }

        if (err?.type === 'popup_failed_to_open') {
          // Attempt One-Tap as seamless background alternative
          promptGoogleOneTap();

          const blockedErr = new Error(
            'The Google Sign-In popup was blocked by your browser or iframe security settings. Please allow popups for this site, or open the app in a new tab.'
          );
          (blockedErr as any).code = 'POPUP_BLOCKED';
          cbs?.onError(blockedErr);
          return;
        }

        cbs?.onError(
          new Error(err?.message || 'Google authentication encountered an error.')
        );
      }
    });

    return true;
  } catch (err: any) {
    console.warn('[GoogleAuthLoader] initOAuth2TokenClient exception:', err);
    return false;
  }
}

/**
 * Initiates the Google Sign-In flow using OAuth2 TokenClient.
 * Uses pre-initialized client when available for synchronous user gesture preservation.
 */
export function requestGoogleAccessToken(
  clientId: string,
  onSuccess: (accessToken: string) => Promise<void> | void,
  onError: (err: Error) => void,
  onCancel?: () => void
): void {
  currentTokenCallbacks = { onSuccess, onError, onCancel };

  if (!isGoogleSdkLoaded() || !window.google?.accounts?.oauth2) {
    onError(new Error('Google Identity Services SDK is not ready yet.'));
    return;
  }

  try {
    if (!cachedTokenClient) {
      initOAuth2TokenClient(clientId, onSuccess, onError, onCancel);
    }

    if (cachedTokenClient) {
      // Execute requestAccessToken immediately and synchronously
      cachedTokenClient.requestAccessToken({ prompt: 'select_account' });
    } else {
      onError(new Error('Google OAuth2 Token Client could not be initialized.'));
    }
  } catch (err: any) {
    console.error('[GoogleAuthLoader] requestGoogleAccessToken exception:', err);
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}
