"""
Core AI Agent for accommodation finding.
Uses Claude with web search to find Airbnb spaces and hotels.
"""

import json
import re
from typing import Generator
import anthropic
from preferences import AccommodationPreferences


SYSTEM_PROMPT = """You are StayFinder AI — a warm, expert travel assistant that helps users find the perfect Airbnb space or hotel. Your job is twofold:

1. **Gather preferences** through natural, conversational questions
2. **Search and recommend** real accommodations using web search

## Conversation Flow

Start by warmly greeting the user and asking for their destination and travel dates. Then progressively collect:
- Number of guests (adults, children)
- Budget per night (min/max)
- Accommodation preference: Airbnb / hotel / both
- Transportation needs (public transit, walkable, need parking, etc.)
- Nearby activities or areas of interest (beach, downtown, nightlife, museums, hiking, etc.)
- Must-have amenities (wifi, pool, kitchen, AC, washer, pet-friendly, accessible, etc.)
- Vibe preference (quiet/relaxing, lively/social, family-friendly, romantic, etc.)

Don't ask all questions at once — ask 1-2 questions per turn to keep the conversation natural. Once you have the core info (destination + guests + budget), you can start searching.

## Searching for Accommodations

When you have enough information, use your web search tool to find real, current listings. Search strategies:
- For Airbnb: Search "airbnb [destination] [guests] guests [budget] per night [dates]"
- For hotels: Search "hotels in [destination] [budget] [dates] booking.com" or "best hotels [destination] near [area]"
- For specific needs: "pet friendly airbnb [destination]", "hotel near [transit] [destination]"

Always search multiple times to find varied options. Look for:
- Specific listings with real prices and ratings
- Neighborhood guides relevant to their activities
- Transportation options near the accommodations

## Presenting Results

Present 3-5 specific options with:
- 🏠 **Name/Title** — clear property name
- 📍 **Location** — neighborhood + proximity to requested areas
- 💰 **Price** — per night and estimated total if dates known
- ⭐ **Rating** — if available
- ✨ **Highlights** — 2-3 key features matching their preferences
- 🚌 **Transport** — nearby transit or walkability
- 🔗 **Link** — direct booking URL if found

After presenting options, ask if they'd like more details on any listing, want to adjust preferences, or search in a different area.

## Preference Tracking

After each user message, if you've learned new preferences, include a JSON block at the END of your response in this exact format (the app extracts it):
<PREFERENCES>
{
  "destination": "...",
  "num_guests": 2,
  "budget_min": 100,
  "budget_max": 200,
  "check_in": "2025-06-10",
  "check_out": "2025-06-15",
  "accommodation_type": "airbnb",
  "amenities": ["wifi", "kitchen"],
  "transportation_needs": "walkable",
  "activities": ["beach", "nightlife"],
  "pet_friendly": false
}
</PREFERENCES>

Only include fields that were explicitly mentioned or clearly inferred. Omit null/empty fields.

## Tone & Style
- Warm, knowledgeable, and efficient — like a well-traveled friend
- Use relevant emojis sparingly for readability
- Be proactive: if someone mentions "going to a conference downtown", note the proximity need automatically
- Offer insider tips about neighborhoods when relevant
- If a budget seems very tight for the destination, gently flag it and suggest alternatives
"""


class AccommodationAgent:
    """AI agent that finds accommodations through conversational search."""

    def __init__(self, api_key: str):
        self.client = anthropic.Anthropic(api_key=api_key)
        self.conversation_history: list[dict] = []
        self.preferences = AccommodationPreferences()
        self.search_performed = False

    def chat(self, user_message: str) -> Generator[str, None, None]:
        """
        Send a message and stream the response.
        Yields text chunks as they arrive.
        """
        self.conversation_history.append({
            "role": "user",
            "content": user_message
        })

        full_response = ""

        with self.client.messages.stream(
            model="claude-opus-4-8",
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            tools=[
                {
                    "type": "web_search_20250305",
                    "name": "web_search",
                    "max_uses": 5
                }
            ],
            messages=self.conversation_history
        ) as stream:
            for text in stream.text_stream:
                full_response += text
                yield text

        # Add assistant response to history
        self.conversation_history.append({
            "role": "assistant",
            "content": full_response
        })

        # Extract and update preferences from response
        self._extract_preferences(full_response)

        if "site:airbnb.com" in user_message.lower() or any(
            word in full_response.lower() for word in ["airbnb.com", "booking.com", "hotels.com"]
        ):
            self.search_performed = True

    def _extract_preferences(self, response_text: str) -> None:
        """Extract structured preferences from the AI response."""
        match = re.search(r'<PREFERENCES>(.*?)</PREFERENCES>', response_text, re.DOTALL)
        if not match:
            return

        try:
            data = json.loads(match.group(1).strip())

            # Map JSON fields to preferences object
            field_map = {
                "destination": "destination",
                "num_guests": "num_guests",
                "num_adults": "num_adults",
                "num_children": "num_children",
                "budget_min": "budget_min",
                "budget_max": "budget_max",
                "budget_currency": "budget_currency",
                "check_in": "check_in",
                "check_out": "check_out",
                "num_nights": "num_nights",
                "accommodation_type": "accommodation_type",
                "room_type": "room_type",
                "property_type": "property_type",
                "amenities": "amenities",
                "num_bedrooms": "num_bedrooms",
                "num_bathrooms": "num_bathrooms",
                "transportation_needs": "transportation_needs",
                "max_distance_to_transit": "max_distance_to_transit",
                "activities": "activities",
                "vibe": "vibe",
                "pet_friendly": "pet_friendly",
                "accessible": "accessible",
                "special_requests": "special_requests",
            }

            for json_key, pref_key in field_map.items():
                if json_key in data and data[json_key] is not None:
                    setattr(self.preferences, pref_key, data[json_key])

        except (json.JSONDecodeError, KeyError):
            pass  # Silently ignore malformed preference blocks

    def get_preferences_summary(self) -> str:
        """Return formatted current preferences."""
        return self.preferences.to_search_summary()

    def reset(self) -> None:
        """Reset the conversation and preferences."""
        self.conversation_history = []
        self.preferences = AccommodationPreferences()
        self.search_performed = False

    def has_preferences(self) -> bool:
        """Check if any preferences have been gathered."""
        return bool(self.preferences.destination or self.preferences.num_guests)