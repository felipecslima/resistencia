import { Injectable, signal } from '@angular/core';

/** Hash SHA-256 da senha de acesso. A senha em si não fica no código. */
const PASS_HASH = '34f90c64b46df19af6c32f90a7d10fa11b0d84dc2aec3894758bffb6904a4169';
const STORE_KEY = 'mergeconflict.access';

/**
 * Portão de acesso 100% no cliente (sem banco). Impede o uso casual do jogo sem a senha,
 * mas não é segurança forte: quem inspecionar o código pode contornar.
 */
@Injectable({ providedIn: 'root' })
export class AccessService {
  readonly unlocked = signal(this.restore());

  /** Retorna true e libera o acesso se a senha estiver correta. */
  async attempt(password: string): Promise<boolean> {
    const hash = await this.sha256(password.trim());
    if (hash !== PASS_HASH) return false;
    try { localStorage.setItem(STORE_KEY, PASS_HASH); } catch { /* ignora */ }
    this.unlocked.set(true);
    return true;
  }

  lock(): void {
    try { localStorage.removeItem(STORE_KEY); } catch { /* ignora */ }
    this.unlocked.set(false);
  }

  private restore(): boolean {
    try { return localStorage.getItem(STORE_KEY) === PASS_HASH; } catch { return false; }
  }

  private async sha256(text: string): Promise<string> {
    if (!globalThis.crypto?.subtle) throw new Error('Abra o jogo por HTTPS ou localhost para validar a senha.');
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
}
