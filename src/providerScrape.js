const PARSE_FAILED = 'PARSE_FAILED';

function parseProviderUsage(provider, bodyText) {
  if (!provider || typeof provider.parse !== 'function') {
    return { error: PARSE_FAILED };
  }

  try {
    const result = provider.parse(String(bodyText || ''));
    if (!result || typeof result !== 'object') {
      return { error: PARSE_FAILED };
    }
    return result;
  } catch (error) {
    return { error: PARSE_FAILED };
  }
}

module.exports = {
  PARSE_FAILED,
  parseProviderUsage
};
