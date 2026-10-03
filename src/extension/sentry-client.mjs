import { BrowserClient, Scope, makeFetchTransport } from '@sentry/browser';

const DSN = 'https://c12fb6ef286c98a566b72826ef09f4e6@o4511620723703808.ingest.de.sentry.io/4512175340126288';
let client, scope, lastStatus;
function initialize() {
  if (client) return;
  const release = 'legaluga-uyap-asistani@' + globalThis.chrome.runtime.getManifest().version;
  client = new BrowserClient({
    dsn: DSN, release, environment: 'production', integrations: [], stackParser: () => [],
    sendClientReports: false, autoSessionTracking: false,
    dataCollection: {
      userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false,
      graphQL: { document: false, variables: false }, genAI: { inputs: false, outputs: false },
      databaseQueryData: false, queues: false, stackFrameVariables: false, frameContextLines: 0
    },
    transport: options => makeFetchTransport({ ...options, fetchOptions: { credentials: 'omit', referrerPolicy: 'no-referrer' } }, async (url, options) => {
      const response = await globalThis.fetch(url, { ...options, signal: globalThis.AbortSignal.timeout(5000) });
      lastStatus = response.status;
      return response;
    }),
    beforeSend: event => {
      // SDK'nın ekleyebileceği request/user/context alanlarını da son sınırda kaldır.
      const exception = event.exception?.values?.[0];
      const frames = exception?.stacktrace?.frames || [];
      const safe = globalThis.UHDReporter.toSentryEvent({
        operation: event.tags?.operation, source: event.tags?.source, type: exception?.type,
        code: event.tags?.code, status: Number(event.tags?.http_status),
        frames: frames.map(f => ({ file: String(f.filename || '').replace(/^app:\/\/\//, ''), line: f.lineno, column: f.colno }))
      });
      return safe ? { ...safe, event_id: event.event_id, timestamp: event.timestamp, release, environment: 'production', platform: 'javascript' } : null;
    }
  });
  scope = new Scope();
  scope.setClient(client);
  client.init();
}
async function send(report) {
  const event = globalThis.UHDReporter.toSentryEvent(report);
  if (!event) return { ok: false, sent: false };
  try {
    initialize();
    lastStatus = null;
    const eventId = scope.captureEvent(event);
    const flushed = await client.flush(6000);
    return { ok: true, sent: flushed && lastStatus >= 200 && lastStatus < 300, eventId };
  } catch { return { ok: false, sent: false }; }
}
globalThis.UHDSentry = { send };
