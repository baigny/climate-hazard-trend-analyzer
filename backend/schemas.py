"""Validated public request schemas shared by API and spatial selection."""
from datetime import datetime, timezone
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from backend.flood import FLOOD_MIN_YEAR

class Location(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=160)
    country: str = Field(default="India", min_length=1, max_length=100)
    state: str = Field(default="", max_length=100)
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)
    timezone: str = Field(default="auto", max_length=64)

    @field_validator("name", "country", "state")
    @classmethod
    def safe_label(cls, value, info):
        value = value.strip()
        if any(ord(char) < 32 or ord(char) == 127 for char in value) or (info.field_name != "state" and not value):
            raise ValueError("Use a non-empty readable location label without control characters")
        return value

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, value):
        if value != "auto":
            try:
                ZoneInfo(value)
            except (ZoneInfoNotFoundError, ValueError):
                raise ValueError("Unknown timezone")
        return value


class BoundingBox(BaseModel):
    model_config = ConfigDict(extra="forbid")
    south: float = Field(ge=-90, le=90, allow_inf_nan=False)
    north: float = Field(ge=-90, le=90, allow_inf_nan=False)
    west: float = Field(ge=-180, le=180, allow_inf_nan=False)
    east: float = Field(ge=-180, le=180, allow_inf_nan=False)

    @model_validator(mode="after")
    def valid_bounds(self):
        if self.south >= self.north or self.west >= self.east:
            raise ValueError("Bounding box south/west must be less than north/east.")
        return self


class AnalysisInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    location: Location
    location_mode: Literal["coordinates", "list", "bounding_box"] = "coordinates"
    locations: list[Location] | None = Field(default=None, min_length=2, max_length=10)
    bounding_box: BoundingBox | None = None
    start_year: int = Field(ge=1950)
    end_year: int
    hazard: Literal["heatwave", "heavy_rainfall", "drought", "wind", "flood", "cyclone", "earthquake"] = "heatwave"

    @model_validator(mode="after")
    def valid_range(self):
        last = datetime.now(timezone.utc).year - 1
        if not self.start_year <= self.end_year <= last:
            raise ValueError(f"Choose complete years between 1950 and {last}, start no later than end")
        if self.end_year - self.start_year + 1 > 80:
            raise ValueError("Choose at most 80 years")
        if self.hazard == "flood" and self.start_year < FLOOD_MIN_YEAR:
            raise ValueError(f"GloFAS river-discharge data is available from {FLOOD_MIN_YEAR}.")
        if self.location_mode == "list":
            if not self.locations or self.bounding_box is not None:
                raise ValueError("Provide a coordinate list and no bounding box.")
            coordinates = [(round(item.latitude, 4), round(item.longitude, 4)) for item in self.locations]
            if len(coordinates) != len(set(coordinates)):
                raise ValueError("Coordinate list contains duplicate locations.")
        elif self.location_mode == "bounding_box":
            if self.bounding_box is None or self.locations is not None:
                raise ValueError("Provide a bounding box and no coordinate list.")
        elif self.locations is not None or self.bounding_box is not None:
            raise ValueError("Coordinate mode accepts one selected location only.")
        if self.hazard in ("cyclone", "earthquake") and self.location_mode != "coordinates":
            raise ValueError("Worldwide cyclone and earthquake catalogs do not accept location filters.")
        return self


