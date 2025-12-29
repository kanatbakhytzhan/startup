// src/environments/environment.prod.ts
export const environment = {
  production: true,
  apiUrl: 'https://api.safealmaty.kz/api/v1',
  mapConfig: {
    defaultCenter: {
      lat: 43.2380,
      lng: 76.9286
    },
    defaultZoom: 12,
    maxZoom: 18,
    minZoom: 10
  },
  tileLayer: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors'
  }
};