export function getAuthErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error)) {
    return fallback;
  }

  const normalizedMessage = error.message.trim();
  const message = normalizedMessage.toLowerCase();

  if (message.includes('email rate limit exceeded') || message.includes('too many requests')) {
    return 'O Supabase atingiu o limite de envio de emails deste projeto. Aguarde um pouco para tentar de novo ou configure um SMTP proprio no painel do Supabase.';
  }

  if (message.includes('email address not authorized')) {
    return 'O SMTP padrao do Supabase so envia emails para enderecos autorizados da equipe do projeto. Para testes com outros emails, configure um SMTP proprio.';
  }

  if (message.includes('user already registered')) {
    return 'Este email ja esta cadastrado. Tente entrar ou use outro email.';
  }

  if (message.includes('invalid login credentials')) {
    return 'Email ou senha invalidos.';
  }

  return normalizedMessage || fallback;
}
