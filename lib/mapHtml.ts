export type MapPoint = {
  latitude: number;
  longitude: number;
  label: string;
  color: string;
};

/**
 * Builds a self-contained HTML document that renders an OpenStreetMap map
 * (via Leaflet, loaded from a CDN — the WebView fetches it over the
 * device's own network connection, independent of our app bundle) with a
 * pin per point and a dashed line connecting them when there are exactly
 * two. No API key needed, unlike Google Maps.
 */
export function generateCrossingMapHtml(points: MapPoint[], distanceLabel?: string): string {
  const markersJs = points
    .map(
      (p) => `
        L.circleMarker([${p.latitude}, ${p.longitude}], {
          radius: 9,
          color: '${p.color}',
          fillColor: '${p.color}',
          fillOpacity: 0.9,
          weight: 2,
        })
          .addTo(map)
          .bindPopup(${JSON.stringify(p.label)});
      `
    )
    .join('\n');

  const lineJs =
    points.length === 2
      ? `
        L.polyline([[${points[0].latitude}, ${points[0].longitude}], [${points[1].latitude}, ${points[1].longitude}]], {
          color: '#8a8f9c',
          weight: 2,
          dashArray: '6 6',
        }).addTo(map);
      `
      : '';

  const boundsJs = `
    var bounds = L.latLngBounds(${JSON.stringify(points.map((p) => [p.latitude, p.longitude]))});
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
  `;

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <style>
      html, body, #map { height: 100%; margin: 0; padding: 0; }
      .distance-badge {
        position: absolute;
        top: 12px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(20, 23, 29, 0.85);
        color: #fff;
        padding: 6px 14px;
        border-radius: 999px;
        font: 600 13px -apple-system, Roboto, sans-serif;
        z-index: 1000;
      }
    </style>
  </head>
  <body>
    <div id="map"></div>
    ${distanceLabel ? `<div class="distance-badge">${distanceLabel}</div>` : ''}
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script>
      var map = L.map('map', { zoomControl: true });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);
      ${markersJs}
      ${lineJs}
      ${boundsJs}
    </script>
  </body>
</html>`;
}
