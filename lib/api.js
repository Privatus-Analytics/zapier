'use strict';

const crypto = require('crypto');
const spec = require('./spec.json');

const DEFAULT_BASE_URL = 'https://privatusanalytics.com';

/**
 * The API host, no trailing slash. PRIVATUS_BASE_URL (set with
 * `zapier env:set` or in .env) points a development version at a local or
 * staging server. Connections never choose a host.
 */
const baseUrl = () => (process.env.PRIVATUS_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');

const url = (path) => `${baseUrl()}${path}`;
const enc = encodeURIComponent;

/** The `data` member of the JSON envelope (or the whole body). */
const unwrap = (response) => {
  if (response.status === 204 || !response.content) return null;
  const body = response.data;
  return body && typeof body === 'object' && Object.prototype.hasOwnProperty.call(body, 'data') ? body.data : body;
};

const call = async (z, method, path, { params, body } = {}) =>
  unwrap(await z.request({ method, url: url(path), params, body }));

/** Every page of a collection (per_page max 100), capped at maxPages. */
const listAll = async (z, path, params = {}, maxPages = 10) => {
  let all = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const response = await z.request({ method: 'GET', url: url(path), params: { ...params, page, per_page: 100 } });
    const body = response.data || {};
    const items = Array.isArray(body.data) ? body.data : [];
    all = all.concat(items);
    const meta = body.meta || {};
    if (!meta.total_pages || page >= meta.total_pages || items.length === 0) break;
  }
  return all;
};

/**
 * The connection's workspace. A token belongs to one workspace and
 * GET /workspaces.json lists only that one, so no Zap asks for it.
 * Remembered on the bundle for the rest of the invocation.
 */
const workspaceId = async (z, bundle) => {
  if (bundle.inputData && bundle.inputData.workspace_id) return bundle.inputData.workspace_id;
  if (!bundle.privatusWorkspaceId) {
    const workspaces = (await call(z, 'GET', '/workspaces.json')) || [];
    if (!workspaces[0]) {
      throw new z.errors.Error('This API token cannot see any workspace.', 'NoWorkspace', 403);
    }
    // Not enumerable, so it never reaches the logs or the Zap's data.
    Object.defineProperty(bundle, 'privatusWorkspaceId', { value: workspaces[0].id, enumerable: false });
  }
  return bundle.privatusWorkspaceId;
};

/** "https://www.Example.com/x" -> "example.com" */
const normalizeDomain = (input) => {
  let s = String(input || '').trim().toLowerCase();
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').split(/[/?#]/)[0].replace(/:\d+$/, '').replace(/\.+$/, '');
  if (s.startsWith('www.') && s.split('.').length > 2) s = s.slice(4);
  return s;
};

/** Accepts a Zapier date or datetime and returns YYYY-MM-DD. */
const toDate = (value) => {
  if (value === undefined || value === null || value === '') return undefined;
  const s = String(value).trim();
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  if (m) return m[1];
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString().slice(0, 10);
};

/** Accepts a Zapier date or datetime and returns YYYY-MM. */
const toMonth = (value) => {
  const s = String(value || '').trim();
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  const day = toDate(s);
  return day ? day.slice(0, 7) : undefined;
};

/** Drops undefined, null and '' (only what the user filled in is sent). */
const compact = (obj) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== ''));

const blank = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

/** A list from a Zapier list field, a comma-separated string or a JSON array. */
const toList = (value) => {
  if (blank(value)) return undefined;
  if (Array.isArray(value)) return value.flatMap((v) => toList(v) || []);
  const s = String(value).trim();
  if (s.startsWith('[')) {
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {
      /* not JSON, treat as text */
    }
  }
  return s.split(',').map((part) => part.trim()).filter(Boolean);
};

const toBoolean = (value) => {
  if (blank(value)) return undefined;
  if (typeof value === 'boolean') return value;
  const s = String(value).trim().toLowerCase();
  if (['true', 'yes', '1', 'on'].includes(s)) return true;
  if (['false', 'no', '0', 'off'].includes(s)) return false;
  return undefined;
};

/** JSON text (an object or an array) from a text field, or a value already parsed. */
const toJson = (z, value, name) => {
  if (blank(value)) return undefined;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch (e) {
    throw new z.errors.Error(`${name} must be valid JSON.`, 'InvalidJson', 400);
  }
};

/** Converts a filled-in value to what the API expects for that input. */
const coerce = (z, input, value) => {
  if (blank(value)) return undefined;
  switch (input.type) {
    case 'integer': {
      const n = parseInt(value, 10);
      return Number.isNaN(n) ? value : n;
    }
    case 'number': {
      const n = Number(value);
      return Number.isNaN(n) ? value : n;
    }
    case 'boolean':
      return toBoolean(value);
    case 'object':
      return toJson(z, value, input.name);
    case 'array':
      if (input.items === 'object' || input.items === 'array' || input.name === 'filters') {
        const parsed = toJson(z, value, input.name);
        return Array.isArray(parsed) ? parsed : [parsed];
      }
      return toList(value);
    default:
      return value;
  }
};

/**
 * Calls one API operation by its operationId. Path parameters come from
 * `values` (site_id, id, ...), and workspace_id is the connection's own.
 * The other inputs become the query string (GET) or the JSON body, coerced
 * to their documented types. Only inputs the operation declares are sent.
 */
const run = async (z, bundle, operationId, values = bundle.inputData || {}) => {
  const operation = spec[operationId];
  if (!operation) throw new Error(`Unknown operation ${operationId}`);
  const all = { ...values };
  if (operation.path.includes('{workspace_id}') && !all.workspace_id) {
    all.workspace_id = await workspaceId(z, bundle);
  }

  const path = operation.path.replace(/\{(\w+)\}/g, (_, name) => {
    if (blank(all[name])) throw new z.errors.Error(`${name} is required.`, 'MissingInput', 400);
    // A colon stays as it is: a breakdown of prop:plan is routed only that way.
    return enc(String(all[name]).trim()).replace(/%3A/gi, ':');
  });

  const payload = {};
  operation.inputs
    .filter((input) => input.in !== 'path')
    .forEach((input) => {
      const value = coerce(z, input, all[input.name]);
      if (value !== undefined) payload[input.name] = value;
    });

  if (operation.method === 'GET' || operation.method === 'DELETE') {
    // A list of plain values goes as status[]=a&status[]=b, the way Rails
    // reads an array. Filters and other structures go as JSON, as
    // /docs/api/filters shows.
    const params = {};
    Object.entries(payload).forEach(([k, v]) => {
      if (Array.isArray(v) && k !== 'filters' && v.every((item) => item === null || typeof item !== 'object')) {
        params[`${k}[]`] = v.map(String);
      } else {
        params[k] = typeof v === 'object' ? JSON.stringify(v) : v;
      }
    });
    return call(z, operation.method, path, { params });
  }
  return call(z, operation.method, path, { body: payload });
};

const SIGNATURE_HEADER = 'privatus-signature';
/** Seconds a signature stays valid (the webhooks docs ask for five minutes). */
const SIGNATURE_TOLERANCE = 300;

/** A request header by name, whatever its case (Zapier adds an `Http-` prefix). */
const header = (headers, name) => {
  const key = Object.keys(headers || {}).find(
    (candidate) => candidate.toLowerCase().replace(/_/g, '-').replace(/^http-/, '') === name
  );
  return key && typeof headers[key] === 'string' ? headers[key] : '';
};

/**
 * Checks the signature of a webhook delivery (https://privatusanalytics.com/docs/api/webhooks):
 * `Privatus-Signature: t=<unix time>,v1=<hex>`, where v1 is the HMAC-SHA256 of
 * "<t>.<raw body>" keyed with the endpoint's signing secret (returned when the
 * hook was subscribed). True only for a matching signature at most five minutes
 * old. A delivery with no signature, no known secret or no raw body cannot be
 * checked, so it is refused.
 */
const verifySignature = (bundle, now = Date.now()) => {
  const secret = bundle.subscribeData && bundle.subscribeData.secret;
  const raw = bundle.rawRequest || {};
  if (typeof secret !== 'string' || !secret || typeof raw.content !== 'string') return false;

  const parts = {};
  header(raw.headers, SIGNATURE_HEADER)
    .split(',')
    .forEach((part) => {
      const at = part.indexOf('=');
      if (at > 0) parts[part.slice(0, at).trim()] = part.slice(at + 1).trim();
    });
  if (!/^\d{1,12}$/.test(parts.t || '') || !/^[0-9a-f]{64}$/.test(parts.v1 || '')) return false;
  if (Math.abs(now / 1000 - Number(parts.t)) > SIGNATURE_TOLERANCE) return false;

  const expected = crypto.createHmac('sha256', secret).update(`${parts.t}.${raw.content}`).digest('hex');
  // Both are 64 hex characters here, so the buffers have the same length.
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
};

module.exports = {
  DEFAULT_BASE_URL,
  baseUrl,
  url,
  enc,
  call,
  run,
  listAll,
  workspaceId,
  normalizeDomain,
  toDate,
  toMonth,
  toList,
  toBoolean,
  compact,
  coerce,
  verifySignature,
};
