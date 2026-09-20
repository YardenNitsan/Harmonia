// Test harness only. Never loaded by the product.
import { YouTubeBridgeProvider } from '/youtube-bridge';

const childOrigin = document.body.dataset.childOrigin;
const probe = (window.probe = {
  sent: [],
  received: [],
  violations: [],
  lifecycle: [],
  listeners: 0,
  dropOutgoing: false,
});
document.addEventListener('securitypolicyviolation', (event) => {
  probe.violations.push({ directive: event.effectiveDirective, blocked: event.blockedURI });
});
const frame = (window.playerFrame = document.createElement('iframe'));
frame.title = 'Isolated deterministic player';
frame.width = '480';
frame.height = '270';
frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
document.body.append(frame);
const peer = frame.contentWindow;
const transport = {
  send(data, targetOrigin) {
    if (targetOrigin !== childOrigin) throw new Error('Unexpected target origin');
    probe.sent.push(JSON.parse(data));
    if (!probe.dropOutgoing) peer.postMessage(data, targetOrigin);
  },
  subscribe(listener) {
    const handler = (event) => {
      probe.received.push({ origin: event.origin, expectedSource: event.source === peer });
      listener(event);
    };
    window.addEventListener('message', handler);
    probe.listeners++;
    return () => {
      window.removeEventListener('message', handler);
      probe.listeners--;
    };
  },
};
window.provider = new YouTubeBridgeProvider(transport, {
  peer: { origin: childOrigin, source: peer },
  timeoutMs: 10000,
});
// Diagnostic lifecycle messages never enter the provider's string-only protocol.
window.addEventListener('message', (event) => {
  if (event.origin === childOrigin && event.source === peer && event.data?.testLifecycle)
    probe.lifecycle.push(event.data.testLifecycle);
});
frame.src = childOrigin + '/child.html#' + provider.session;
window.readState = () => ({
  status: provider.status,
  available: provider.available,
  playing: provider.playing,
  position: provider.position,
  duration: provider.duration,
  error: provider.error?.code ?? null,
});
window.addEventListener('pagehide', () => provider.dispose());
