import { Country, State, City } from 'country-state-city';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve('backend/data/locations');
mkdirSync(root, { recursive: true });
const write = (file, value) => writeFileSync(resolve(root, file), JSON.stringify(value));
write('countries.json', Country.getAllCountries().map(c => ({ id: c.isoCode, name: c.name })).sort((a,b) => a.name.localeCompare(b.name)));
let count = 0;
for (const country of Country.getAllCountries()) {
  const states = State.getStatesOfCountry(country.isoCode);
  mkdirSync(resolve(root, country.isoCode), { recursive: true });
  write(`${country.isoCode}/states.json`, states.map(s => ({ id: s.isoCode, name: s.name })).sort((a,b) => a.name.localeCompare(b.name)));
  // Some countries have no first-level subdivision in this source.
  const stateCodes = states.length ? states.map(s => s.isoCode) : ['_'];
  for (const state of stateCodes) {
    const raw = state === '_' ? City.getCitiesOfCountry(country.isoCode) : City.getCitiesOfState(country.isoCode, state);
    const cities = raw.filter(c => c.latitude && c.longitude).map((c,i) => ({ id: `${country.isoCode}:${state}:${i}`, name: c.name, latitude: Number(c.latitude), longitude: Number(c.longitude) })).sort((a,b) => a.name.localeCompare(b.name));
    if (cities.length) { write(`${country.isoCode}/${state}.json`, cities); count += cities.length; }
  }
}
write('source.json', { package: 'country-state-city', version: '3.2.1', source: 'https://github.com/dr5hn/countries-states-cities-database', coverage: 'Community-maintained snapshot; not a complete or authoritative gazetteer.' });
writeFileSync(resolve(root, 'LICENSE.source'), readFileSync(resolve('node_modules/country-state-city/LICENSE')));
console.log(`Generated location lists with ${count} coordinate-bearing settlements.`);
