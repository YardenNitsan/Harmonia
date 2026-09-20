// Test harness only. Deterministic SDK double, actual adapter and endpoint.
import { YouTubeProvider } from '/youtube';
import { YouTubeBridgeEndpoint } from '/youtube-endpoint';

const parentOrigin = document.body.dataset.parentOrigin;
const probe = (window.probe = {
  created: 0,
  destroyed: 0,
  paused: 0,
  playing: false,
  ready: false,
  listeners: 0,
  sent: [],
  received: [],
  violations: [],
  holdPlay: false,
  holdReady: false,
  dropOutgoing: false,
  playAttempts: 0,
});
document.addEventListener('securitypolicyviolation', (event) => {
  probe.violations.push({ directive: event.effectiveDirective, blocked: event.blockedURI });
});
const transport = {
  send(data, targetOrigin) {
    if (targetOrigin !== parentOrigin) throw new Error('Unexpected target origin');
    probe.sent.push(JSON.parse(data));
    if (!probe.dropOutgoing) parent.postMessage(data, targetOrigin);
  },
  subscribe(listener) {
    const handler = (event) => {
      probe.received.push({ origin: event.origin, expectedSource: event.source === parent });
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
window.endpoint = new YouTubeBridgeEndpoint(
  transport,
  {
    peer: { origin: parentOrigin, source: parent },
    session: location.hash.slice(1),
  },
  () => {
    const host = document.createElement('div');
    document.body.append(host);
    const provider = new YouTubeProvider(
      (_host, options) => {
        probe.created++;
        probe.options = options.playerVars;
        host.style.width = options.width + 'px';
        host.style.height = options.height + 'px';
        host.textContent = 'Deterministic SDK player';
        let position = 0,
          playing = false,
          started = 0,
          destroyed = false;
        const now = () => position + (playing ? (performance.now() - started) / 1000 : 0);
        window.sdkEvents = options.events;
        if (!probe.holdReady) queueMicrotask(() => options.events.onReady());
        return {
          playVideo() {
            probe.playAttempts++;
            if (probe.holdPlay) return;
            started = performance.now();
            playing = true;
            probe.playing = true;
            queueMicrotask(() => options.events.onStateChange({ data: 1 }));
          },
          pauseVideo() {
            position = now();
            playing = false;
            probe.playing = false;
            probe.paused++;
            options.events.onStateChange({ data: 2 });
          },
          seekTo(seconds) {
            position = seconds;
            started = performance.now();
          },
          getCurrentTime() {
            return now();
          },
          getDuration() {
            return 120;
          },
          destroy() {
            if (destroyed) throw new Error('Double destruction');
            destroyed = true;
            playing = false;
            probe.playing = false;
            probe.destroyed++;
            host.remove();
          },
        };
      },
      { origin: location.origin },
    );
    return { provider, host };
  },
);
// Required host lifecycle hook, explicitly part of the test fixture rather than
// an assertion that removing a document allows its lease timer to keep running.
window.addEventListener('pagehide', () => {
  endpoint.dispose();
  parent.postMessage(
    {
      testLifecycle: {
        destroyed: probe.destroyed,
        created: probe.created,
        playing: probe.playing,
        listeners: probe.listeners,
      },
    },
    parentOrigin,
  );
});
probe.ready = true;
