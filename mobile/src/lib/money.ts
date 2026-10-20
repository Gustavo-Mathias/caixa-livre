/** Dinheiro sempre em centavos inteiros. Sem Intl, para formatar igual em qualquer aparelho. */

export function formatBRL(cents: number, opts: { sign?: boolean; symbol?: boolean } = {}): string {
  const { sign = false, symbol = true } = opts;
  const neg = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const int = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const frac = (abs % 100).toString().padStart(2, '0');
  const body = `${symbol ? 'R$ ' : ''}${int},${frac}`;
  if (neg) return `−${body}`;
  return sign && abs > 0 ? `+${body}` : body;
}

/** Converte o que a pessoa digitou ("1.234,56", "1234,5", "12.5") em centavos. */
export function parseBRL(text: string): number | null {
  let t = text.replace(/[^\d.,]/g, '');
  if (!t) return null;
  if (t.includes(',')) {
    t = t.replace(/\./g, '').replace(',', '.');
  } else if ((t.match(/\./g) ?? []).length > 1) {
    t = t.replace(/\./g, '');
  }
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

/** Valor em centavos para o campo de texto, sem símbolo. */
export function toInputBRL(cents: number): string {
  return formatBRL(cents, { symbol: false });
}
