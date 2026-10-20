/**
 * CPF e CNPJ.
 *
 * Desde julho de 2026 a Receita emite CNPJ alfanumérico: as 12 primeiras posições aceitam
 * letras e números, e os 2 dígitos verificadores continuam numéricos. Cada caractere vale o
 * código ASCII menos 48 (A = 17, B = 18...) e o módulo 11 segue igual. O banco repete a mesma
 * regra (is_valid_cnpj), então o app e o servidor sempre concordam.
 */

export type DocumentKind = 'pf' | 'pj';

/** Remove pontuação e deixa letras em maiúsculas. */
export function normalizeDocument(input: string): string {
  return input.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
}

function checkDigit(values: number[], weights: number[]): number {
  let sum = 0;
  for (let i = 0; i < weights.length; i++) sum += values[i] * weights[i];
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

export function isValidCpf(input: string): boolean {
  const d = normalizeDocument(input);
  if (!/^[0-9]{11}$/.test(d) || /^(.)\1{10}$/.test(d)) return false;
  const v = d.split('').map(Number);
  const dv1 = checkDigit(v, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (dv1 !== v[9]) return false;
  return checkDigit(v, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]) === v[10];
}

const CNPJ_W1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const CNPJ_W2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

export function isValidCnpj(input: string): boolean {
  const d = normalizeDocument(input);
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(d) || /^(.)\1{13}$/.test(d)) return false;
  const v = d.split('').map((c) => c.charCodeAt(0) - 48);
  if (checkDigit(v, CNPJ_W1) !== v[12]) return false;
  return checkDigit(v, CNPJ_W2) === v[13];
}

export function isValidDocument(kind: DocumentKind, input: string): boolean {
  return kind === 'pf' ? isValidCpf(input) : isValidCnpj(input);
}

/** Aplica a máscara enquanto a pessoa digita. Aceita texto colado com ou sem pontuação. */
export function maskDocument(kind: DocumentKind, input: string): string {
  if (kind === 'pf') {
    const d = input.replace(/\D/g, '').slice(0, 11);
    const p = [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9), d.slice(9, 11)];
    let out = p[0];
    if (p[1]) out += '.' + p[1];
    if (p[2]) out += '.' + p[2];
    if (p[3]) out += '-' + p[3];
    return out;
  }
  // CNPJ: os dois últimos caracteres (dígitos verificadores) são sempre números.
  const raw = normalizeDocument(input).slice(0, 14);
  const d = raw.slice(0, 12) + raw.slice(12).replace(/\D/g, '');
  const p = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 8), d.slice(8, 12), d.slice(12, 14)];
  let out = p[0];
  if (p[1]) out += '.' + p[1];
  if (p[2]) out += '.' + p[2];
  if (p[3]) out += '/' + p[3];
  if (p[4]) out += '-' + p[4];
  return out;
}

export function formatDocument(kind: DocumentKind, normalized: string): string {
  return maskDocument(kind, normalized);
}

export type DocumentCheck = { ok: true; value: string } | { ok: false; message: string };

export function checkDocument(kind: DocumentKind, input: string): DocumentCheck {
  const value = normalizeDocument(input);
  const label = kind === 'pf' ? 'CPF' : 'CNPJ';
  const size = kind === 'pf' ? 11 : 14;
  if (value.length === 0) return { ok: false, message: `Informe o ${label}.` };
  if (value.length < size) return { ok: false, message: `O ${label} tem ${size} caracteres.` };
  if (!isValidDocument(kind, value)) return { ok: false, message: `${label} inválido. Confira os números.` };
  return { ok: true, value };
}
