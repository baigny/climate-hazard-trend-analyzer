"""Current report wording, including results recovered from older caches."""
import re

_NAMES = re.compile(r"dry[- ]spell drought[- ]proxy|high[- ]wind proxy|river[- ]flood proxy|proxies|proxy", re.IGNORECASE)


def _wording(text):
    def replace(match):
        phrase = match.group().lower()
        if phrase.startswith("dry"):
            return "drought"
        if phrase.startswith("high"):
            return "wind"
        if phrase.startswith("river"):
            return "flood"
        return "indicators" if phrase == "proxies" else "indicator"
    return _NAMES.sub(replace, text)


def present_analysis(data):
    result = dict(data)
    for field in ("insights", "warnings"):
        if field in data:
            result[field] = [_wording(text) for text in data[field]]
    if "methodology" in data:
        result["methodology"] = {
            key: _wording(value) if isinstance(value, str) else value
            for key, value in data["methodology"].items()
        }
    return result
