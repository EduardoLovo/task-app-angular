// O localStorage pode estar bloqueado (aba anônima, política do navegador): nesse caso o app
// segue funcionando, só sem lembrar a escolha entre recarregamentos.

export function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // sem persistência
  }
}
