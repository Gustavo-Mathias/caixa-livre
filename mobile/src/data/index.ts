import { env } from '@/lib/env';
import type { Backend } from './backend';
import { mockBackend } from './backend.mock';
import { supabaseBackend } from './backend.supabase';

export const backend: Backend = env.mock ? mockBackend : supabaseBackend;
export * from './backend';
