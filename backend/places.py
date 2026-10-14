"""Label map coordinates with the nearest settlement in the local gazetteer."""
import json
import unicodedata
from functools import lru_cache
from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree


def search_key(value):
    """Match accented place names without changing their displayed spelling."""
    return ''.join(char for char in unicodedata.normalize('NFKD', value.casefold())
                   if not unicodedata.combining(char)).strip()


def sphere(latitude, longitude):
    lat, lon = np.radians([latitude, longitude])
    return [np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)]


@lru_cache(maxsize=1)
def settlement_index(root):
    root = Path(root)
    countries = {row['id']: row['name'] for row in json.loads((root / 'countries.json').read_text(encoding='utf-8'))}
    places, points = [], []
    for code, country in countries.items():
        folder = root / code
        states_file = folder / 'states.json'
        states = {row['id']: row['name'] for row in json.loads(states_file.read_text(encoding='utf-8'))} if states_file.exists() else {}
        for file in sorted(folder.glob('*.json')):
            if file.name == 'states.json':
                continue
            for city in json.loads(file.read_text(encoding='utf-8')):
                places.append({'name': city['name'], 'country': country, 'state': states.get(file.stem, '')})
                points.append((city['latitude'], city['longitude']))
    if not points:
        raise ValueError('No settlement coordinates available')
    lat, lon = np.radians(np.asarray(points)).T
    vectors = np.column_stack((np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)))
    return cKDTree(vectors), places


def nearest_place(root, latitude, longitude):
    tree, places = settlement_index(str(root))
    chord, index = tree.query(sphere(latitude, longitude))
    distance = float(2 * 6371 * np.arcsin(min(1, chord / 2)))
    place = places[int(index)]
    return {**place, 'name': f"Near {place['name']}", 'distance_km': round(distance, 1),
            'latitude': latitude, 'longitude': longitude,
            'timezone': 'Asia/Kolkata' if place['country'] == 'India' else 'auto'}
