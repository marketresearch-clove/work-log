// Only active in local development
if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
  (function() {
    const es = new EventSource('/__reload');
    es.onmessage = function() { location.reload(); };
    es.onerror = function() { setTimeout(function() { location.reload(); }, 2000); };
  })();
}
