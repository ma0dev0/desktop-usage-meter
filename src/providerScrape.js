const PARSE_FAILED = 'PARSE_FAILED';
const SCRAPE_FAILED = 'SCRAPE_FAILED';

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

async function scrapeProviderSafely(scrape, provider) {
  if (typeof scrape !== 'function') {
    return { error: SCRAPE_FAILED };
  }

  try {
    const result = await scrape(provider);
    if (!result || typeof result !== 'object') {
      return { error: SCRAPE_FAILED };
    }
    return result;
  } catch (error) {
    return { error: SCRAPE_FAILED };
  }
}

module.exports = {
  PARSE_FAILED,
  SCRAPE_FAILED,
  parseProviderUsage,
  scrapeProviderSafely
};
