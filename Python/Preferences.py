"""
Data models for user accommodation preferences.
"""

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class AccommodationPreferences:
    """Stores all user preferences for accommodation search."""

    # Location
    destination: Optional[str] = None
    proximity_to: Optional[str] = None          # e.g. "beach", "downtown", "airport"

    # Guests
    num_guests: Optional[int] = None
    num_adults: Optional[int] = None
    num_children: Optional[int] = None

    # Stay details
    check_in: Optional[str] = None
    check_out: Optional[str] = None
    num_nights: Optional[int] = None

    # Budget
    budget_min: Optional[float] = None
    budget_max: Optional[float] = None
    budget_currency: str = "USD"

    # Accommodation type
    accommodation_type: Optional[str] = None    # "airbnb", "hotel", "both"
    room_type: Optional[str] = None             # "entire place", "private room", "shared"
    property_type: Optional[str] = None         # "apartment", "house", "villa", etc.

    # Amenities
    amenities: list = field(default_factory=list)  # ["wifi", "pool", "kitchen", etc.]
    num_bedrooms: Optional[int] = None
    num_bathrooms: Optional[int] = None

    # Transportation
    transportation_needs: Optional[str] = None  # "public transit", "walkable", "parking"
    max_distance_to_transit: Optional[str] = None

    # Activities & Interests
    activities: list = field(default_factory=list)  # ["hiking", "nightlife", "museums"]
    vibe: Optional[str] = None                  # "quiet", "lively", "family-friendly"

    # Special requirements
    pet_friendly: bool = False
    accessible: bool = False
    special_requests: Optional[str] = None

    def is_complete_for_search(self) -> bool:
        """Check if we have enough info to perform a meaningful search."""
        return bool(self.destination and self.num_guests)

    def to_search_summary(self) -> str:
        """Return a human-readable summary of preferences."""
        parts = []
        if self.destination:
            parts.append(f"📍 Destination: {self.destination}")
        if self.num_guests:
            parts.append(f"👥 Guests: {self.num_guests}")
        if self.check_in and self.check_out:
            parts.append(f"📅 Dates: {self.check_in} → {self.check_out}")
        if self.budget_max:
            budget_str = f"up to {self.budget_currency} {self.budget_max:.0f}/night"
            if self.budget_min:
                budget_str = f"{self.budget_currency} {self.budget_min:.0f}–{self.budget_max:.0f}/night"
            parts.append(f"💰 Budget: {budget_str}")
        if self.accommodation_type:
            parts.append(f"🏠 Type: {self.accommodation_type}")
        if self.amenities:
            parts.append(f"✨ Amenities: {', '.join(self.amenities)}")
        if self.transportation_needs:
            parts.append(f"🚌 Transport: {self.transportation_needs}")
        if self.activities:
            parts.append(f"🎯 Activities: {', '.join(self.activities)}")
        if self.pet_friendly:
            parts.append("🐾 Pet-friendly required")
        if self.accessible:
            parts.append("♿ Accessibility required")
        if self.special_requests:
            parts.append(f"📝 Special: {self.special_requests}")
        return "\n".join(parts) if parts else "No preferences set yet."

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {k: v for k, v in self.__dict__.items() if v is not None and v != [] and v is not False}