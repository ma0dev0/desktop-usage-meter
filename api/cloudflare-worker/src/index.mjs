const LATEST_KEY = 'latest';

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...(init.headers || {})
    }
  });
}

function requestApiKey(request) {
  const authorization = request.headers.get('authorization') || '';
  const bearer = authorization.match(/^Bearer\s+(.+)$/i);
  if (bearer) return bearer[1].trim();
  return (request.headers.get('x-api-key') || '').trim();
}

function hasKv(env) {
  return env && env.USAGE_METER_KV
    && typeof env.USAGE_METER_KV.get === 'function'
    && typeof env.USAGE_METER_KV.put === 'function';
}

async function readJsonBody(request) {
  const text = await request.text();
  if (!text || text.length > 32 * 1024) return null;
  try {
    JSON.parse(text);
    return text;
  } catch (error) {
    return null;
  }
}

export async function handleRequest(request, env = {}) {
  const url = new URL(request.url);
  if (url.pathname !== '/usage') {
    return jsonResponse({ error: 'NOT_FOUND' }, { status: 404 });
  }

  if (!env.USAGE_METER_API_KEY) {
    return jsonResponse({ error: 'API_KEY_NOT_CONFIGURED' }, { status: 500 });
  }
  if (!hasKv(env)) {
    return jsonResponse({ error: 'KV_NOT_CONFIGURED' }, { status: 500 });
  }
  if (requestApiKey(request) !== env.USAGE_METER_API_KEY) {
    return jsonResponse({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  if (request.method === 'POST') {
    const body = await readJsonBody(request);
    if (!body) return jsonResponse({ error: 'INVALID_JSON' }, { status: 400 });
    await env.USAGE_METER_KV.put(LATEST_KEY, body);
    return new Response(null, { status: 204 });
  }

  if (request.method === 'GET') {
    const body = await env.USAGE_METER_KV.get(LATEST_KEY);
    if (!body) return jsonResponse({ error: 'NO_DATA' }, { status: 404 });
    return new Response(body, {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store'
      }
    });
  }

  return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, {
    status: 405,
    headers: { allow: 'GET, POST' }
  });
}

export default {
  fetch: handleRequest
};
